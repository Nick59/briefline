import type { LayoutServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';

export const load: LayoutServerLoad = ({ params, url }) => {
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
	const active = projectParam
		? projects.find((p) => p.key === projectParam.toUpperCase() || p.id === projectParam)
		: undefined;
	return {
		projects,
		activeProjectKey: active?.key ?? null,
		activeEpics: active ? app().epics.list(active.id) : [],
		profile: app().profile.get(),
		presence: app().presence.snapshot(),
		inboxCount: app().inbox.count('dashboard')
	};
};
