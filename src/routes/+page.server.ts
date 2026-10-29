import type { PageServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';
import { operationActions } from '#lib/server/http/operation-actions.ts';

export const load: PageServerLoad = () => {
	const services = app();
	const activity = services.projects
		.list()
		.flatMap((p) => services.activity.forProject(p.id, 10))
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.slice(0, 15);
	return { activity };
};

export const actions = operationActions;
