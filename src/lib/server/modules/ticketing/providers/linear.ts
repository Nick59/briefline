import type { WorkStatus } from '#lib/shared/domain/constants.ts';
import {
	expectOk,
	providerFetch,
	requireSecret,
	requireSetting,
	resolveMapped,
	TicketProviderError,
	TIMEOUT_MS,
	type ProviderContext,
	type ProviderState,
	type TicketProvider
} from '../provider.ts';

const STATE_TYPE: Record<WorkStatus, string> = {
	todo: 'unstarted',
	in_progress: 'started',
	done: 'completed'
};

async function graphql<T>(
	ctx: ProviderContext,
	query: string,
	variables: Record<string, unknown> = {}
): Promise<T> {
	const response = await providerFetch(ctx, 'Linear', 'https://api.linear.app/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			// Personal API keys are sent as-is; the Bearer prefix is only for OAuth tokens.
			authorization: requireSecret(ctx)
		},
		body: JSON.stringify({ query, variables }),
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	await expectOk(response, 'Linear request', ctx);
	const result = (await response.json()) as { data?: T; errors?: { message: string }[] };
	if (result.errors?.length) throw new TicketProviderError(`Linear: ${result.errors[0].message}`);
	return result.data as T;
}

interface LinearState {
	id: string;
	name: string;
	type: string;
	position: number;
}

const toStates = (nodes: LinearState[]): ProviderState[] =>
	[...nodes]
		.sort((a, b) => a.position - b.position)
		.map(({ id, name, type }) => ({ id, name, group: type }));

interface IssueLookup {
	issue: { id: string; team: { states: { nodes: LinearState[] } } };
}

export const linearProvider: TicketProvider = {
	reservedHeaders: ['authorization'],
	id: 'linear',
	label: 'Linear',
	description:
		'Moves the issue to the workflow state mapped to its progress, or the first state of the matching type, and posts progress comments.',
	settings: [
		{
			name: 'workspace',
			label: 'Workspace slug',
			required: false,
			scope: 'connection',
			placeholder: 'acme'
		},
		{
			name: 'teamKey',
			label: 'Team key',
			required: false,
			scope: 'project',
			placeholder: 'ENG',
			help: 'Needed to load the workflow states for status mapping.'
		}
	],
	envVars: ['LINEAR_API_KEY'],
	secretLabel: 'API key',
	secretEnvVar: 'LINEAR_API_KEY',
	supportsStates: true,
	ticketUrl(ref, settings) {
		return settings.workspace ? `https://linear.app/${settings.workspace}/issue/${ref.key}` : null;
	},
	async testConnection(ctx) {
		await graphql(ctx, 'query { viewer { id } }');
	},
	async listStates(ctx) {
		const key = requireSetting(ctx, 'teamKey');
		const { teams } = await graphql<{ teams: { nodes: { states: { nodes: LinearState[] } }[] } }>(
			ctx,
			'query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { states { nodes { id name type position } } } } }',
			{ key }
		);
		const team = teams.nodes[0];
		if (!team) throw new TicketProviderError(`Linear team '${key}' was not found`);
		return toStates(team.states.nodes);
	},
	async syncComment(ctx, comment) {
		if (comment.body === null) {
			const result = await graphql<{ commentDelete: { success: boolean } }>(
				ctx,
				'mutation($id: String!) { commentDelete(id: $id) { success } }',
				{ id: comment.remoteId }
			);
			if (!result.commentDelete.success)
				throw new TicketProviderError('Linear comment deletion failed');
			return null;
		}
		if (comment.remoteId) {
			const result = await graphql<{ commentUpdate: { success: boolean } }>(
				ctx,
				'mutation($id: String!, $body: String!) { commentUpdate(id: $id, input: { body: $body }) { success } }',
				{ id: comment.remoteId, body: comment.body }
			);
			if (!result.commentUpdate.success)
				throw new TicketProviderError('Linear comment update failed');
			return comment.remoteId;
		}
		const { issue } = await graphql<{ issue: { id: string } }>(
			ctx,
			'query($id: String!) { issue(id: $id) { id } }',
			{ id: ctx.ref.key }
		);
		const result = await graphql<{ commentCreate: { success: boolean; comment: { id: string } } }>(
			ctx,
			'mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id } } }',
			{ issueId: issue.id, body: comment.body }
		);
		if (!result.commentCreate.success)
			throw new TicketProviderError('Linear comment creation failed');
		return result.commentCreate.comment.id;
	},
	async push(ctx, update) {
		const { issue } = await graphql<IssueLookup>(
			ctx,
			'query($id: String!) { issue(id: $id) { id team { states { nodes { id name type position } } } } }',
			{ id: ctx.ref.key }
		);
		const states = toStates(issue.team.states.nodes);
		const mapped = resolveMapped(ctx, states);
		const state = mapped.state ?? states.find((s) => s.group === STATE_TYPE[update.status]);
		if (state) {
			await graphql(
				ctx,
				'mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }',
				{ id: issue.id, stateId: state.id }
			);
		}
		if (update.comment) {
			await graphql(
				ctx,
				'mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success } }',
				{ issueId: issue.id, body: update.comment }
			);
		}
		return { note: mapped.note };
	}
};
