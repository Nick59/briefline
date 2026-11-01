import type { PageServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';
import { loadPage } from '#lib/server/http/pagination.ts';

const SESSIONS_PAGE_SIZE = 20;

export const load: PageServerLoad = ({ url }) => {
	const services = app();
	const actor = url.searchParams.get('actor') || undefined;
	return {
		filters: { actor: actor ?? null },
		actors: services.sessions.actors(),
		sessions: loadPage(
			url,
			'page',
			(paging) => services.sessions.list({ actor, ...paging }),
			SESSIONS_PAGE_SIZE
		)
	};
};
