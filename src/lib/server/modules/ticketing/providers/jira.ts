import type { WorkStatus } from '#lib/shared/domain/constants.ts';
import {
	expectOk,
	requireEnv,
	requireSetting,
	TIMEOUT_MS,
	type TicketContext,
	type TicketProvider
} from '../provider.ts';

const STATUS_CATEGORY: Record<WorkStatus, string> = {
	todo: 'new',
	in_progress: 'indeterminate',
	done: 'done'
};

interface Transition {
	id: string;
	name: string;
	to: { name: string; statusCategory: { key: string } };
}

function request(ctx: TicketContext, path: string, init: RequestInit = {}) {
	const base = requireSetting(ctx, 'baseUrl').replace(/\/+$/, '');
	const auth = Buffer.from(
		`${requireEnv(ctx, 'JIRA_EMAIL')}:${requireEnv(ctx, 'JIRA_API_TOKEN')}`
	).toString('base64');
	return ctx.fetch(`${base}${path}`, {
		...init,
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
			authorization: `Basic ${auth}`
		},
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
}

export const jiraProvider: TicketProvider = {
	id: 'jira',
	label: 'Jira',
	description:
		'Moves the issue to the matching status category (To Do, In Progress, Done) and posts progress comments.',
	settings: [
		{
			name: 'baseUrl',
			label: 'Jira site URL',
			required: true,
			placeholder: 'https://your-team.atlassian.net'
		},
		{
			name: 'doneStatus',
			label: 'Preferred "done" status name',
			required: false,
			placeholder: 'Done'
		}
	],
	envVars: ['JIRA_EMAIL', 'JIRA_API_TOKEN'],
	ticketUrl(ref, settings) {
		return settings.baseUrl ? `${settings.baseUrl.replace(/\/+$/, '')}/browse/${ref.key}` : null;
	},
	async push(ctx, update) {
		const key = encodeURIComponent(ctx.ref.key);
		const response = await request(ctx, `/rest/api/2/issue/${key}/transitions`);
		await expectOk(response, 'Jira list transitions');
		const { transitions } = (await response.json()) as { transitions: Transition[] };
		const category = STATUS_CATEGORY[update.status];
		const candidates = transitions.filter((t) => t.to.statusCategory.key === category);
		const preferred = update.status === 'done' ? ctx.settings.doneStatus?.toLowerCase() : undefined;
		const transition =
			candidates.find((t) => t.to.name.toLowerCase() === preferred) ?? candidates[0];
		if (transition) {
			const moved = await request(ctx, `/rest/api/2/issue/${key}/transitions`, {
				method: 'POST',
				body: JSON.stringify({ transition: { id: transition.id } })
			});
			await expectOk(moved, 'Jira transition');
		}
		if (update.comment) {
			const commented = await request(ctx, `/rest/api/2/issue/${key}/comment`, {
				method: 'POST',
				body: JSON.stringify({ body: update.comment })
			});
			await expectOk(commented, 'Jira comment');
		}
	}
};
