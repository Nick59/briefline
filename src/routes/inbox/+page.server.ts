import type { PageServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';
import { operationActions } from '#lib/server/http/operation-actions.ts';

export const load: PageServerLoad = () => ({ inbox: app().inbox.list() });

export const actions = operationActions;
