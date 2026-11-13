import type { Activity, ExternalRef, Page } from '#lib/shared/domain/types.ts';
import {
	all,
	fromJson,
	one,
	run,
	toJson,
	transaction,
	type Db,
	type Params
} from '../../db/connection.ts';

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
	project_key: string | null;
	epic_key: string | null;
	task_key: string | null;
	seq: number;
	session_id: string | null;
}

// A deleted task leaves task_id null, so the epic ref must not stand in for it on task events.
const ticketOf = (row: ActivityRow): ExternalRef | undefined => {
	const raw = row.task_id ? row.task_ref : row.action.startsWith('epic.') ? row.epic_ref : null;
	const ref = fromJson<Partial<ExternalRef> | null>(raw, null);
	return ref?.key
		? { provider: ref.provider ?? '', key: ref.key, url: ref.url ?? null }
		: undefined;
};

const targetOf = (row: ActivityRow): Activity['target'] =>
	row.project_key
		? { projectKey: row.project_key, epicKey: row.epic_key, taskKey: row.task_key }
		: null;

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
	target: targetOf(row),
	sessionId: row.session_id,
	createdAt: row.created_at
});

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
export const MAX_ACTIVITY_LIST_SIZE = 200;

export interface ActivityFilter {
	projectId?: string;
	epicId?: string;
	taskId?: string;
	sessionId?: string;
	/** Only entries whose action starts with this. */
	actionPrefix?: string;
	/** Only entries with this sequence number or a higher one. */
	sinceSeq?: number;
	actor?: string;
	/** Only entries by these actors. */
	actorIn?: string[];
	/** Leaves out entries by these actors. */
	actorNotIn?: string[];
	/** Oldest first instead of newest first. */
	ascending?: boolean;
	limit?: number;
	offset?: number;
}

export class ActivityRepository {
	constructor(private readonly db: Db) {}

	insert(activity: Omit<Activity, 'target'>) {
		transaction(this.db, () => this.insertEntry(activity));
	}

	actors(): string[] {
		return all<{ actor: string }>(
			this.db,
			'SELECT DISTINCT actor FROM activity ORDER BY actor'
		).map((row) => row.actor);
	}

	private insertEntry(activity: Omit<Activity, 'target'>) {
		// A counter table rather than rowid: rowids are reused after the newest rows are deleted
		// (for example by a cascade), which would move a stored cursor past entries it has never returned.
		const { value } = one<{ value: number }>(
			this.db,
			'UPDATE activity_counter SET value = value + 1 WHERE id = 1 RETURNING value'
		)!;
		run(
			this.db,
			`INSERT INTO activity (id, seq, project_id, epic_id, task_id, actor, action, message, data, created_at, session_id)
			 VALUES (:id, :seq, :projectId, :epicId, :taskId, :actor, :action, :message, :data, :createdAt, :sessionId)`,
			{
				seq: value,
				id: activity.id,
				projectId: activity.projectId,
				epicId: activity.epicId,
				taskId: activity.taskId,
				actor: activity.actor,
				action: activity.action,
				message: activity.message,
				data: toJson(activity.data) ?? '{}',
				createdAt: activity.createdAt,
				sessionId: activity.sessionId
			}
		);
	}

	list(filter: ActivityFilter): Page<Activity> {
		const where: string[] = [];
		const params: Params = {};
		for (const [column, key] of [
			['project_id', 'projectId'],
			['epic_id', 'epicId'],
			['task_id', 'taskId'],
			['session_id', 'sessionId']
		] as const) {
			const value = filter[key];
			if (value) {
				where.push(`a.${column} = :${key}`);
				params[key] = value;
			}
		}
		if (filter.actionPrefix) {
			where.push("a.action LIKE :actionPrefix || '%'");
			params.actionPrefix = filter.actionPrefix;
		}
		if (filter.sinceSeq !== undefined) {
			where.push('a.seq >= :sinceSeq');
			params.sinceSeq = filter.sinceSeq;
		}
		if (filter.actor) {
			where.push('a.actor = :actor');
			params.actor = filter.actor;
		}
		for (const [list, negate] of [
			[filter.actorIn, false],
			[filter.actorNotIn, true]
		] as const) {
			if (!list) continue;
			const names = list.map((name, i) => {
				params[`${negate ? 'out' : 'in'}${i}`] = name;
				return `:${negate ? 'out' : 'in'}${i}`;
			});
			// An empty list matches nobody, and excludes nobody.
			where.push(
				names.length
					? `a.actor ${negate ? 'NOT ' : ''}IN (${names.join(', ')})`
					: negate
						? '1'
						: '0'
			);
		}
		const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
		const total = all<{ n: number }>(
			this.db,
			`SELECT COUNT(*) AS n FROM activity a ${clause}`,
			params
		)[0].n;
		const items = all<ActivityRow>(
			this.db,
			`SELECT a.*, t.external_ref AS task_ref, e.external_ref AS epic_ref,
			        p.key AS project_key, e.key AS epic_key, t.key AS task_key
			 FROM activity a
			 LEFT JOIN tasks t ON t.id = a.task_id
			 LEFT JOIN epics e ON e.id = a.epic_id
			 LEFT JOIN projects p ON p.id = a.project_id
			 ${clause} ORDER BY a.seq ${filter.ascending ? 'ASC' : 'DESC'} LIMIT :limit OFFSET :offset`,
			{
				...params,
				limit: Math.min(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_ACTIVITY_LIST_SIZE),
				offset: Math.max(filter.offset ?? 0, 0)
			}
		).map(toActivity);
		return { items, total };
	}

	head(): number {
		return one<{ value: number }>(this.db, 'SELECT value FROM activity_counter WHERE id = 1')!
			.value;
	}
}
