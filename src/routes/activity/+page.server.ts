import type { PageServerLoad } from './$types';
import { ACTIVITY_WHO, type ActivityWho } from '#lib/shared/domain/actors.ts';
import { app } from '#lib/server/runtime.ts';
import { loadPage } from '#lib/server/http/pagination.ts';
import { operationActions } from '#lib/server/http/operation-actions.ts';

const ACTIVITY_PAGE_SIZE = 50;

export const load: PageServerLoad = ({ url }) => {
	const services = app();
	const requestedProject = url.searchParams.get('project')?.toUpperCase();
	const project = services.projects.list().find((p) => p.key === requestedProject)?.key;
	const requestedWho = url.searchParams.get('who');
	const who = ACTIVITY_WHO.find((value) => value === requestedWho) ?? ('all' as ActivityWho);
	const actor = url.searchParams.get('actor') || undefined;
	return {
		filters: { project: project ?? null, who, actor: actor ?? null },
		actors: services.activity.actors(),
		activity: loadPage(
			url,
			'page',
			(paging) => services.activity.list({ project, who, actor, ...paging }),
			ACTIVITY_PAGE_SIZE
		)
	};
};

export const actions = operationActions;
