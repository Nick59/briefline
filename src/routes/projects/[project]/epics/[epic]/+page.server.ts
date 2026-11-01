import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';
import { orHttpError } from '#lib/server/http/load.ts';
import { firstPage } from '#lib/server/http/pagination.ts';
import { operationActions } from '#lib/server/http/operation-actions.ts';

export const load: PageServerLoad = ({ params, url }) => {
	const services = app();
	const epic = orHttpError(() => services.epics.detail(params.epic));
	if (epic.project.key !== params.project.toUpperCase())
		error(404, `Epic ${params.epic} is not in project ${params.project}`);
	if (params.epic !== epic.key || params.project !== epic.project.key) {
		redirect(308, `/projects/${epic.project.key}/epics/${epic.key}${url.search}`);
	}
	const project = services.projects.get(epic.projectId);

	const requested = url.searchParams.get('spec');
	const specId = epic.specs.find((s) => s.id === requested)?.id ?? epic.specs[0]?.id;

	return {
		project,
		epic,
		selectedSpec: specId ? services.specs.get(specId) : null,
		activity: firstPage((paging) => services.activity.forEpic(epic.id, paging)),
		syncJobs: services.ticketing.jobs({ epicId: epic.id, limit: 8 }),
		ticketUrl: epic.externalRef ? services.ticketing.ticketUrl(project, epic.externalRef) : null
	};
};

export const actions = operationActions;
