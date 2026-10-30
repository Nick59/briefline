import type { Activity, ExternalRef, Page } from '#lib/shared/domain/types.ts';
import { all, fromJson, run, toJson, type Db, type Params } from '../../db/connection.ts';

interface ActivityRow {
	id: string;
	project_id: string;
	epic_id: string | null;
	task_id: string | null;
	actor: string;
	action: string;
	message: string;
	data: string;
	created_at: string;
	task_ref: string | null;
	epic_ref: string | null;
}

// A deleted task leaves task_id null, so the epic ref must not stand in for it on task events.
const ticketOf = (row: ActivityRow): ExternalRef | undefined => {
	const raw = row.task_id ? row.task_ref : row.action.startsWith('epic.') ? row.epic_ref : null;
	const ref = fromJson<Partial<ExternalRef> | null>(raw, null);
	return ref?.key
		? { provider: ref.provider ?? '', key: ref.key, url: ref.url ?? null }
		: undefined;
};

const toActivity = (row: ActivityRow): Activity => ({
	id: row.id,
	projectId: row.project_id,
	epicId: row.epic_id,
	taskId: row.task_id,
	actor: row.actor,
	action: row.action,
	message: row.message,
	data: fromJson<Record<string, unknown>>(row.data, {}),
	ticket: ticketOf(row),
	createdAt: row.created_at
});

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export interface ActivityFilter {
	projectId?: string;
	epicId?: string;
	taskId?: string;
	limit?: number;
	offset?: number;
}

export class ActivityRepository {
	constructor(private readonly db: Db) {}

	insert(activity: Activity) {
		run(
			this.db,
			`INSERT INTO activity (id, project_id, epic_id, task_id, actor, action, message, data, created_at)
			 VALUES (:id, :projectId, :epicId, :taskId, :actor, :action, :message, :data, :createdAt)`,
			{
				id: activity.id,
				projectId: activity.projectId,
				epicId: activity.epicId,
				taskId: activity.taskId,
				actor: activity.actor,
				action: activity.action,
				message: activity.message,
				data: toJson(activity.data) ?? '{}',
				createdAt: activity.createdAt
			}
		);
	}

	list(filter: ActivityFilter): Page<Activity> {
		const where: string[] = [];
		const params: Params = {};
		for (const [column, key] of [
			['project_id', 'projectId'],
			['epic_id', 'epicId'],
			['task_id', 'taskId']
		] as const) {
			const value = filter[key];
			if (value) {
				where.push(`a.${column} = :${key}`);
				params[key] = value;
			}
		}
		const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
		const total = all<{ n: number }>(
			this.db,
			`SELECT COUNT(*) AS n FROM activity a ${clause}`,
			params
		)[0].n;
		const items = all<ActivityRow>(
			this.db,
			`SELECT a.*, t.external_ref AS task_ref, e.external_ref AS epic_ref
			 FROM activity a
			 LEFT JOIN tasks t ON t.id = a.task_id
			 LEFT JOIN epics e ON e.id = a.epic_id
			 ${clause} ORDER BY a.created_at DESC, a.id DESC LIMIT :limit OFFSET :offset`,
			{
				...params,
				limit: Math.min(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
				offset: Math.max(filter.offset ?? 0, 0)
			}
		).map(toActivity);
		return { items, total };
	}
}
