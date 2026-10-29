import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';
import { orHttpError } from '#lib/server/http/load.ts';
import { operationActions } from '#lib/server/http/operation-actions.ts';

export const load: PageServerLoad = ({ params }) => {
	const services = app();
	const project = orHttpError(() => services.projects.get(params.project));
	if (params.project !== project.key) redirect(308, `/projects/${project.key}`);
	return {
		project,
		epics: services.epics
			.list(project.id)
			.map((epic) => ({ ...epic, tasks: services.epics.detail(epic.id).tasks })),
		activity: services.activity.forProject(project.id, 20),
		syncJobs: services.ticketing.jobs({ projectId: project.id, limit: 8 })
	};
};

export const actions = operationActions;
