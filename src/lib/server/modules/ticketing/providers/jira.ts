import type { WorkStatus } from '#lib/shared/domain/constants.ts';
import {
	expectOk,
	providerFetch,
	requireSecret,
	requireSetting,
	TicketProviderError,
	TIMEOUT_MS,
	type ProviderContext,
	type ProviderState,
	type TicketContext,
	type TicketProvider
} from '../provider.ts';

const STATUS_CATEGORY: Record<WorkStatus, string> = {
	todo: 'new',
	in_progress: 'indeterminate',
	done: 'done'
};

// Jira reports the status category; expose it with the same group names as the other providers.
const CATEGORY_GROUP: Record<string, string> = {
	new: 'unstarted',
	indeterminate: 'started',
	done: 'completed'
};

interface Transition {
	id: string;
	name: string;
	to: { id: string; name: string; statusCategory: { key: string } };
}

function request(ctx: ProviderContext, path: string, init: RequestInit = {}) {
	const base = requireSetting(ctx, 'baseUrl').replace(/\/+$/, '');
	const email = ctx.settings.email?.trim() || ctx.env.JIRA_EMAIL;
	if (!email) throw new TicketProviderError('Missing Jira account email');
	const auth = Buffer.from(`${email}:${requireSecret(ctx)}`).toString('base64');
	return providerFetch(ctx, 'Jira', `${base}${path}`, {
		...init,
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
			authorization: `Basic ${auth}`
		},
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
}

async function currentStatusId(ctx: TicketContext, key: string): Promise<string | undefined> {
	const response = await request(ctx, `/rest/api/2/issue/${key}?fields=status`);
	await expectOk(response, 'Jira get issue', ctx);
	const body = (await response.json()) as { fields?: { status?: { id: string } } };
	return body.fields?.status?.id;
}

export const jiraProvider: TicketProvider = {
	reservedHeaders: ['authorization'],
	id: 'jira',
	label: 'Jira',
	description:
		'Moves the issue to the status mapped to its progress, or to the matching status category (To Do, In Progress, Done), and posts progress comments.',
	settings: [
		{
			name: 'baseUrl',
			label: 'Jira site URL',
			required: true,
			scope: 'connection',
			placeholder: 'https://your-team.atlassian.net'
		},
		{
			name: 'email',
			label: 'Account email',
			required: false,
			scope: 'connection',
			placeholder: 'you@example.com',
			help: 'Falls back to the JIRA_EMAIL environment variable.'
		},
		{
			name: 'projectKey',
			label: 'Project key',
			required: false,
			scope: 'project',
			placeholder: 'SHOP',
			help: 'Needed to load the project statuses for status mapping.'
		},
		{
			name: 'doneStatus',
			label: 'Preferred "done" status name',
			required: false,
			scope: 'project',
			placeholder: 'Done',
			help: 'Used only when the Done row of the status mapping is not set.'
		}
	],
	envVars: ['JIRA_EMAIL', 'JIRA_API_TOKEN'],
	secretLabel: 'API token',
	secretEnvVar: 'JIRA_API_TOKEN',
	supportsStates: true,
	ticketUrl(ref, settings) {
		return settings.baseUrl ? `${settings.baseUrl.replace(/\/+$/, '')}/browse/${ref.key}` : null;
	},
	async testConnection(ctx) {
		const response = await request(ctx, '/rest/api/2/myself');
		await expectOk(response, 'Jira check', ctx);
	},
	async listStates(ctx) {
		const key = encodeURIComponent(requireSetting(ctx, 'projectKey'));
		const response = await request(ctx, `/rest/api/2/project/${key}/statuses`);
		await expectOk(response, 'Jira list statuses', ctx);
		const types = (await response.json()) as {
			statuses: { id: string; name: string; statusCategory?: { key: string } }[];
		}[];
		const seen = new Map<string, ProviderState>();
		for (const type of types)
			for (const status of type.statuses)
				if (!seen.has(status.id))
					seen.set(status.id, {
						id: status.id,
						name: status.name,
						group: CATEGORY_GROUP[status.statusCategory?.key ?? '']
					});
		return [...seen.values()];
	},
	async syncComment(ctx, comment) {
		const path = `/rest/api/2/issue/${encodeURIComponent(ctx.ref.key)}/comment${comment.remoteId ? `/${encodeURIComponent(comment.remoteId)}` : ''}`;
		const response = await request(ctx, path, {
			method: comment.body === null ? 'DELETE' : comment.remoteId ? 'PUT' : 'POST',
			body: comment.body === null ? undefined : JSON.stringify({ body: comment.body })
		});
		if (comment.body === null && response.status === 404) return null;
		if (comment.body !== null && comment.remoteId && [404, 405, 501].includes(response.status))
			return jiraProvider.syncComment!(ctx, { ...comment, remoteId: null });
		await expectOk(response, 'Jira comment sync', ctx);
		if (comment.body === null) return null;
		const data = (await response.json()) as { id: string };
		return data.id;
	},
	async push(ctx, update) {
		const key = encodeURIComponent(ctx.ref.key);
		let note: string | undefined;
		let skipMove = false;
		const response = await request(ctx, `/rest/api/2/issue/${key}/transitions`);
		await expectOk(response, 'Jira list transitions', ctx);
		const { transitions } = (await response.json()) as { transitions: Transition[] };

		let transition: Transition | undefined;
		if (ctx.mapped) {
			// Transitions only list statuses reachable from the current one, so an issue that
			// already sits in the mapped status has no transition to it.
			skipMove = (await currentStatusId(ctx, key)) === ctx.mapped.id;
			transition = transitions.find((t) => t.to.id === ctx.mapped!.id);
			if (!transition && !skipMove)
				note = `Mapped status '${ctx.mapped.name}' is not reachable from the issue's current status; used the default`;
		}
		if (!transition && !skipMove) {
			const category = STATUS_CATEGORY[update.status];
			const candidates = transitions.filter((t) => t.to.statusCategory.key === category);
			const preferred =
				update.status === 'done' ? ctx.settings.doneStatus?.toLowerCase() : undefined;
			transition = candidates.find((t) => t.to.name.toLowerCase() === preferred) ?? candidates[0];
		}
		if (transition) {
			const moved = await request(ctx, `/rest/api/2/issue/${key}/transitions`, {
				method: 'POST',
				body: JSON.stringify({ transition: { id: transition.id } })
			});
			await expectOk(moved, 'Jira transition', ctx);
		}
		if (update.comment) {
			const commented = await request(ctx, `/rest/api/2/issue/${key}/comment`, {
				method: 'POST',
				body: JSON.stringify({ body: update.comment })
			});
			await expectOk(commented, 'Jira comment', ctx);
		}
		return { note };
	}
};
