import type { PageServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';
import { firstPage } from '#lib/server/http/pagination.ts';
import { operationActions } from '#lib/server/http/operation-actions.ts';

export const load: PageServerLoad = () => {
	const services = app();
	return { activity: firstPage((paging) => services.activity.recent(paging)) };
};

export const actions = operationActions;
