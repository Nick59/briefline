import type { PageServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';
import { orHttpError } from '#lib/server/http/load.ts';
import { firstPage } from '#lib/server/http/pagination.ts';

export const load: PageServerLoad = ({ params }) => {
	const services = app();
	const { session } = orHttpError(() => services.sessions.get(params.id, { limit: 1 }));
	return {
		session,
		activity: firstPage((paging) => services.sessions.get(session.id, paging).activity)
	};
};
