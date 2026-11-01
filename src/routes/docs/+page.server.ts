import type { PageServerLoad } from './$types';
import { operations } from '#lib/server/api/operations.ts';
import { operationActions } from '#lib/server/http/operation-actions.ts';
import { apiToken } from '#lib/server/runtime.ts';

export const load: PageServerLoad = ({ url }) => ({
	origin: url.origin,
	tokenRequired: apiToken() !== null,
	operations: operations.map(({ name, method, path, summary, tag }) => ({
		name,
		method,
		path: `/api/v1${path}`,
		summary,
		tag
	}))
});

export const actions = operationActions;
