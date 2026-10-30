import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { app } from '#lib/server/runtime.ts';
import { orHttpError } from '#lib/server/http/load.ts';
import { loadPage } from '#lib/server/http/pagination.ts';
import { operationActions } from '#lib/server/http/operation-actions.ts';

export const load: PageServerLoad = ({ params, url }) => {
	const services = app();
	const task = orHttpError(() => services.tasks.detail(params.task));
	if (
		task.epic.key !== params.epic.toUpperCase() ||
		task.project.key !== params.project.toUpperCase()
	) {
		error(404, `Task ${params.task} is not in epic ${params.epic}`);
	}
	if (
		params.task !== task.key ||
		params.epic !== task.epic.key ||
		params.project !== task.project.key
	) {
		redirect(
			308,
			`/projects/${task.project.key}/epics/${task.epic.key}/tasks/${task.key}${url.search}`
		);
	}
	const project = services.projects.get(task.project.id);
	const requested = url.searchParams.get('spec');
	const specId = task.specs.find((s) => s.id === requested)?.id ?? task.specs[0]?.id;

	return {
		project,
		task,
		selectedSpec: specId ? services.specs.get(specId) : null,
		activity: loadPage(url, 'activity', (paging) => services.activity.forTask(task.id, paging)),
		ticketUrl: task.externalRef ? services.ticketing.ticketUrl(project, task.externalRef) : null
	};
};

export const actions = operationActions;
