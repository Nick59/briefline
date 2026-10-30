import type { PageServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';
import { orHttpError } from '#lib/server/http/load.ts';
import { operationActions } from '#lib/server/http/operation-actions.ts';

export const load: PageServerLoad = ({ params }) => ({
	project: orHttpError(() => app().projects.get(params.project)),
	providers: app().ticketing.providers(),
	connections: app().connections.list()
});

export const actions = operationActions;
