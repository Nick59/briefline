import type { WorkStatus } from '#lib/shared/domain/constants.ts';
import {
	expectOk,
	requireSecret,
	requireSetting,
	resolveMapped,
	TicketProviderError,
	TIMEOUT_MS,
	type ProviderContext,
	type ProviderState,
	type TicketProvider
} from '../provider.ts';

const CLOUD_API = 'https://api.plane.so';
const CLOUD_APP = 'https://app.plane.so';

const STATE_GROUPS: Record<WorkStatus, string[]> = {
	todo: ['unstarted', 'backlog'],
	in_progress: ['started'],
	done: ['completed']
};

function apiBase(settings: Record<string, string>) {
	return (settings.baseUrl?.trim() || CLOUD_API).replace(/\/+$/, '');
}

function appBase(settings: Record<string, string>) {
	const api = apiBase(settings);
	return api === CLOUD_API ? CLOUD_APP : api;
}

async function request(ctx: ProviderContext, path: string, init: RequestInit = {}) {
	const slug = encodeURIComponent(requireSetting(ctx, 'workspaceSlug'));
	const response = await ctx.fetch(`${apiBase(ctx.settings)}/api/v1/workspaces/${slug}${path}`, {
		...init,
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
			'x-api-key': requireSecret(ctx)
		},
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	// Plane allows 60 requests a minute; the job can be retried once the window passes.
	if (response.status === 429)
		throw new TicketProviderError('Plane rate limit reached (HTTP 429); retry in a minute');
	return response;
}

function pageResults<T>(body: T[] | { results: T[] }): T[] {
	return Array.isArray(body) ? body : body.results;
}

async function fetchStates(ctx: ProviderContext): Promise<ProviderState[]> {
	const projectId = encodeURIComponent(requireSetting(ctx, 'projectId'));
	const response = await request(ctx, `/projects/${projectId}/states/`);
	await expectOk(response, 'Plane list states');
	const body = (await response.json()) as ProviderState[] | { results: ProviderState[] };
	return pageResults(body).map(({ id, name, group }) => ({ id, name, group }));
}

export const planeProvider: TicketProvider = {
	id: 'plane',
	label: 'Plane',
	description:
		'Moves the work item to the state mapped to its progress, or the first state of the matching group, and posts progress comments.',
	settings: [
		{
			name: 'workspaceSlug',
			label: 'Workspace slug',
			required: true,
			scope: 'connection',
			placeholder: 'acme'
		},
		{
			name: 'baseUrl',
			label: 'API URL (self-hosted only)',
			required: false,
			scope: 'connection',
			placeholder: CLOUD_API
		},
		{
			name: 'projectId',
			label: 'Project ID (UUID)',
			required: true,
			scope: 'project',
			placeholder: '3f1c2a5e-0000-0000-0000-000000000000'
		}
	],
	envVars: ['PLANE_API_KEY'],
	secretLabel: 'API key',
	secretEnvVar: 'PLANE_API_KEY',
	supportsStates: true,
	ticketUrl(ref, settings) {
		const slug = settings.workspaceSlug?.trim();
		return slug
			? `${appBase(settings)}/${encodeURIComponent(slug)}/browse/${encodeURIComponent(ref.key)}/`
			: null;
	},
	async testConnection(ctx) {
		const response = await request(ctx, '/projects/');
		await expectOk(response, 'Plane check');
	},
	listStates: fetchStates,
	async push(ctx, update) {
		const projectId = encodeURIComponent(requireSetting(ctx, 'projectId'));
		const lookup = await request(ctx, `/work-items/${encodeURIComponent(ctx.ref.key)}/`);
		await expectOk(lookup, 'Plane find work item');
		const { id } = (await lookup.json()) as { id: string };

		const states = await fetchStates(ctx);
		const mapped = resolveMapped(ctx, states);
		let state = mapped.state ?? undefined;
		for (const group of state ? [] : STATE_GROUPS[update.status]) {
			state = states.find((s) => s.group === group);
			if (state) break;
		}
		if (state) {
			const moved = await request(ctx, `/projects/${projectId}/issues/${id}/`, {
				method: 'PATCH',
				body: JSON.stringify({ state: state.id })
			});
			await expectOk(moved, 'Plane update work item');
		}
		if (update.comment) {
			const commented = await request(ctx, `/projects/${projectId}/issues/${id}/comments/`, {
				method: 'POST',
				body: JSON.stringify({ comment_html: `<p>${escapeHtml(update.comment)}</p>` })
			});
			await expectOk(commented, 'Plane comment');
		}
		return { note: mapped.note };
	}
};

function escapeHtml(text: string) {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
