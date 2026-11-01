import { z } from 'zod';
import { ACTIVITY_WHO } from '#lib/shared/domain/actors.ts';
import type { Activity, Page, PageView } from '#lib/shared/domain/types.ts';
import type { Container } from '../container.ts';
import { DomainError } from '../core/errors.ts';
import { ACTIVITY_PAGE_SIZE } from './pagination.ts';

const MAX_PAGE_SIZE = 100;

const queryShape = z.object({
	page: z.coerce.number().int().min(1).default(1),
	size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(ACTIVITY_PAGE_SIZE),
	project: z.string().min(1).optional(),
	epic: z.string().min(1).optional(),
	task: z.string().min(1).optional(),
	session: z.string().min(1).optional(),
	who: z.enum(ACTIVITY_WHO).optional(),
	actor: z.string().min(1).optional()
});

/** Reads one page of activity for a scope (task, epic, project or everything) from query params. */
export function readActivityPage(
	services: Pick<Container, 'activity'>,
	params: URLSearchParams
): PageView<Activity> {
	const parsed = queryShape.safeParse(Object.fromEntries(params));
	if (!parsed.success) throw new DomainError(parsed.error.issues[0]!.message, 400, 'invalid_query');
	const { size, project, epic, task, session, who, actor } = parsed.data;
	const fetchPage = (paging: { limit: number; offset: number }): Page<Activity> =>
		session
			? services.activity.forSession(session, paging)
			: task
				? services.activity.forTask(task, paging)
				: epic
					? services.activity.forEpic(epic, paging)
					: services.activity.list({ project, who, actor, ...paging });

	let page = parsed.data.page;
	let result = fetchPage({ limit: size, offset: (page - 1) * size });
	const pageCount = Math.max(1, Math.ceil(result.total / size));
	if (page > pageCount) {
		page = pageCount;
		result = fetchPage({ limit: size, offset: (page - 1) * size });
	}
	return { ...result, page, pageCount, pageSize: size };
}
