import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';
import { orHttpError } from '#lib/server/http/load.ts';
import { firstPage } from '#lib/server/http/pagination.ts';
import { operationActions } from '#lib/server/http/operation-actions.ts';

export const load: PageServerLoad = ({ params, url }) => {
	const services = app();
	const project = orHttpError(() => services.projects.get(params.project));
	if (params.project !== project.key) redirect(308, `/projects/${project.key}`);
	const specs = services.specs.listForProject(project.id);
	const requested = url.searchParams.get('spec');
	const specId = specs.find((s) => s.id === requested)?.id ?? specs[0]?.id;
	return {
		project,
		specs,
		selectedSpec: specId ? services.specs.get(specId) : null,
		epics: services.epics
			.list(project.id)
			.map((epic) => ({ ...epic, tasks: services.epics.detail(epic.id).tasks })),
		activity: firstPage((paging) => services.activity.forProject(project.id, paging)),
		syncJobs: services.ticketing.jobs({ projectId: project.id, limit: 8 })
	};
};

export const actions = operationActions;
