import type { PageServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';
import { loadPage } from '#lib/server/http/pagination.ts';
import { operationActions } from '#lib/server/http/operation-actions.ts';

export const load: PageServerLoad = ({ url }) => {
	const services = app();
	return { activity: loadPage(url, 'activity', (paging) => services.activity.recent(paging)) };
};

export const actions = operationActions;
