import type { WorkStatus } from '#lib/shared/domain/constants.ts';
import {
	expectOk,
	requireEnv,
	TicketProviderError,
	TIMEOUT_MS,
	type TicketContext,
	type TicketProvider
} from '../provider.ts';

const STATE_TYPE: Record<WorkStatus, string> = {
	todo: 'unstarted',
	in_progress: 'started',
	done: 'completed'
};

async function graphql<T>(
	ctx: TicketContext,
	query: string,
	variables: Record<string, unknown>
): Promise<T> {
	const response = await ctx.fetch('https://api.linear.app/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: requireEnv(ctx, 'LINEAR_API_KEY')
		},
		body: JSON.stringify({ query, variables }),
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	await expectOk(response, 'Linear request');
	const result = (await response.json()) as { data?: T; errors?: { message: string }[] };
	if (result.errors?.length) throw new TicketProviderError(`Linear: ${result.errors[0].message}`);
	return result.data as T;
}

interface IssueLookup {
	issue: {
		id: string;
		team: { states: { nodes: { id: string; type: string; position: number }[] } };
	};
}

export const linearProvider: TicketProvider = {
	id: 'linear',
	label: 'Linear',
	description:
		'Moves the issue to the first workflow state of the matching type and posts progress comments.',
	settings: [{ name: 'workspace', label: 'Workspace slug', required: false, placeholder: 'acme' }],
	envVars: ['LINEAR_API_KEY'],
	ticketUrl(ref, settings) {
		return settings.workspace ? `https://linear.app/${settings.workspace}/issue/${ref.key}` : null;
	},
	async push(ctx, update) {
		const { issue } = await graphql<IssueLookup>(
			ctx,
			'query($id: String!) { issue(id: $id) { id team { states { nodes { id type position } } } } }',
			{ id: ctx.ref.key }
		);
		const state = issue.team.states.nodes
			.filter((s) => s.type === STATE_TYPE[update.status])
			.sort((a, b) => a.position - b.position)[0];
		if (state) {
			await graphql(
				ctx,
				'mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }',
				{
					id: issue.id,
					stateId: state.id
				}
			);
		}
		if (update.comment) {
			await graphql(
				ctx,
				'mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success } }',
				{
					issueId: issue.id,
					body: update.comment
				}
			);
		}
	}
};
