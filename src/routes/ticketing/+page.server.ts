import type { PageServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';
import { operationActions } from '#lib/server/http/operation-actions.ts';

export const load: PageServerLoad = () => ({
	connections: app().connections.list(),
	providers: app().ticketing.providers(),
	secretsAvailable: app().connections.secretsAvailable
});

export const actions = operationActions;
