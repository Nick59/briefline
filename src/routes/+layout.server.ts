import type { LayoutServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';

export const load: LayoutServerLoad = ({ params, url, cookies }) => {
	if (url.pathname === '/login')
		return {
			projects: [],
			activeProjectKey: null,
			activeEpics: [],
			profile: null,
			presence: null,
			inboxCount: 0
		};
	const projects = app().projects.list();
	const projectParam = 'project' in params ? params.project : undefined;
	const key = projectParam ?? cookies.get('last_project');
	const active = key
		? projects.find((p) => p.key === key.toUpperCase() || p.id === key)
		: undefined;
	if (active && projectParam)
		cookies.set('last_project', active.key, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 365
		});
	return {
		projects,
		activeProjectKey: active?.key ?? null,
		activeEpics: active ? app().epics.list(active.id) : [],
		profile: app().profile.get(),
		presence: app().presence.snapshot(),
		inboxCount: app().inbox.count('dashboard')
	};
};
