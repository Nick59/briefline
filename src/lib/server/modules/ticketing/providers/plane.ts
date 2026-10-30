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
	type ProviderProject,
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

const HINT = 'Check the base URL and project ID.';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const IDENTIFIER = /^[a-z0-9_]{1,12}$/i;

async function request(ctx: ProviderContext, path: string, init: RequestInit = {}) {
	const slug = encodeURIComponent(requireSetting(ctx, 'workspaceSlug'));
	const url = `${apiBase(ctx.settings)}/api/v1/workspaces/${slug}${path}`;
	const response = await providerFetch(
		ctx,
		'Plane',
		url,
		{
			...init,
			headers: {
				accept: 'application/json',
				'content-type': 'application/json',
				'x-api-key': requireSecret(ctx)
			},
			signal: AbortSignal.timeout(TIMEOUT_MS)
		},
		{ hint: HINT }
	);
	// Plane allows 60 requests a minute; the job can be retried once the window passes.
	if (response.status === 429)
		throw new TicketProviderError('Plane rate limit reached (HTTP 429); retry in a minute');
	return response;
}

function pageResults<T>(body: T[] | { results: T[] }): T[] {
	return Array.isArray(body) ? body : body.results;
}

async function fetchProjects(ctx: ProviderContext): Promise<ProviderProject[]> {
	const response = await request(ctx, '/projects/');
	await expectOk(response, 'Plane list projects');
	const body = (await response.json()) as ProviderProject[] | { results: ProviderProject[] };
	return pageResults(body).map(({ id, name, identifier }) => ({ id, name, identifier }));
}

/** Accepts the project UUID, a Plane URL containing it, or the project identifier (e.g. SOFT). */
async function resolveProjectId(ctx: ProviderContext): Promise<string> {
	const raw = requireSetting(ctx, 'projectId');
	const uuid = raw.match(UUID)?.[0];
	if (uuid) return uuid.toLowerCase();
	if (IDENTIFIER.test(raw)) {
		const match = (await fetchProjects(ctx)).find(
			(p) => p.identifier.toLowerCase() === raw.toLowerCase()
		);
		if (match) return match.id;
	}
	throw new TicketProviderError('Use the Plane project ID (UUID), not the identifier.');
}

async function fetchStates(ctx: ProviderContext): Promise<ProviderState[]> {
	const projectId = await resolveProjectId(ctx);
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
			placeholder: '3f1c2a5e-0000-0000-0000-000000000000',
			picker: 'projects'
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
	listProjects: fetchProjects,
	async push(ctx, update) {
		const projectId = await resolveProjectId(ctx);
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
