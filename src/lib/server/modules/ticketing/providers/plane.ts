import type { WorkStatus } from '#lib/shared/domain/constants.ts';
import {
	expectOk,
	requireEnv,
	requireSetting,
	TicketProviderError,
	TIMEOUT_MS,
	type TicketContext,
	type TicketProvider
} from '../provider.ts';

const CLOUD_API = 'https://api.plane.so';
const CLOUD_APP = 'https://app.plane.so';

const STATE_GROUPS: Record<WorkStatus, string[]> = {
	todo: ['unstarted', 'backlog'],
	in_progress: ['started'],
	done: ['completed']
};

interface PlaneState {
	id: string;
	name: string;
	group: string;
}

function apiBase(settings: Record<string, string>) {
	return (settings.baseUrl?.trim() || CLOUD_API).replace(/\/+$/, '');
}

function appBase(settings: Record<string, string>) {
	const api = apiBase(settings);
	return api === CLOUD_API ? CLOUD_APP : api;
}

async function request(ctx: TicketContext, path: string, init: RequestInit = {}) {
	const slug = encodeURIComponent(requireSetting(ctx, 'workspaceSlug'));
	const response = await ctx.fetch(`${apiBase(ctx.settings)}/api/v1/workspaces/${slug}${path}`, {
		...init,
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
			'x-api-key': requireEnv(ctx, 'PLANE_API_KEY')
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

export const planeProvider: TicketProvider = {
	id: 'plane',
	label: 'Plane',
	description:
		'Moves the work item to the first state of the matching group (unstarted, started, completed) and posts progress comments.',
	settings: [
		{
			name: 'workspaceSlug',
			label: 'Workspace slug',
			required: true,
			placeholder: 'acme'
		},
		{
			name: 'projectId',
			label: 'Project ID (UUID)',
			required: true,
			placeholder: '3f1c2a5e-0000-0000-0000-000000000000'
		},
		{
			name: 'baseUrl',
			label: 'API URL (self-hosted only)',
			required: false,
			placeholder: CLOUD_API
		}
	],
	envVars: ['PLANE_API_KEY'],
	ticketUrl(ref, settings) {
		const slug = settings.workspaceSlug?.trim();
		return slug
			? `${appBase(settings)}/${encodeURIComponent(slug)}/browse/${encodeURIComponent(ref.key)}/`
			: null;
	},
	async push(ctx, update) {
		const projectId = encodeURIComponent(requireSetting(ctx, 'projectId'));
		const lookup = await request(ctx, `/work-items/${encodeURIComponent(ctx.ref.key)}/`);
		await expectOk(lookup, 'Plane find work item');
		const { id } = (await lookup.json()) as { id: string };

		const statesResponse = await request(ctx, `/projects/${projectId}/states/`);
		await expectOk(statesResponse, 'Plane list states');
		const states = pageResults(
			(await statesResponse.json()) as PlaneState[] | { results: PlaneState[] }
		);
		let state: PlaneState | undefined;
		for (const group of STATE_GROUPS[update.status]) {
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
	}
};

function escapeHtml(text: string) {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
