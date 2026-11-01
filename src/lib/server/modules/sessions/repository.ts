import type { SessionRecap, SessionSummary } from '#lib/shared/domain/types.ts';
import { all, one, run, type Db, type Params } from '../../db/connection.ts';

interface SessionRow {
	id: string;
	actor: string;
	client_name: string | null;
	client_version: string | null;
	summary: string | null;
	started_at: string;
	last_seen_at: string;
	ended_at: string | null;
}

interface StatsRow {
	session_id: string;
	activity_count: number;
	stage_changes: number;
	tasks_done: number;
	tasks_created: number;
	epics_created: number;
	specs_added: number;
	specs_updated: number;
	threads_opened: number;
	replies: number;
	answers: number;
}

interface ProjectRow {
	session_id: string;
	id: string;
	key: string;
	name: string;
}

export interface SessionFilter {
	actor?: string;
	/** Also lists sessions that recorded no activity. */
	includeEmpty?: boolean;
	limit: number;
	offset: number;
}

export interface LatestFilter {
	actor?: string;
	projectId?: string;
	excludeId?: string | null;
}

export interface ClientInfo {
	name?: string | null;
	version?: string | null;
}

const EMPTY_RECAP: SessionRecap = {
	stageChanges: 0,
	tasksDone: 0,
	tasksCreated: 0,
	epicsCreated: 0,
	specsAdded: 0,
	specsUpdated: 0,
	threadsOpened: 0,
	replies: 0,
	answers: 0
};

export class SessionRepository {
	constructor(private readonly db: Db) {}

	insert(id: string, actor: string, at: string, client: ClientInfo = {}) {
		run(
			this.db,
			`INSERT OR IGNORE INTO agent_sessions (id, actor, client_name, client_version, started_at, last_seen_at)
			 VALUES (:id, :actor, :name, :version, :at, :at)`,
			{ id, actor, name: client.name ?? null, version: client.version ?? null, at }
		);
	}

	touch(id: string, at: string) {
		run(this.db, 'UPDATE agent_sessions SET last_seen_at = :at WHERE id = :id', { id, at });
	}

	end(id: string, at: string) {
		run(
			this.db,
			'UPDATE agent_sessions SET ended_at = :at, last_seen_at = :at WHERE id = :id AND ended_at IS NULL',
			{ id, at }
		);
	}

	actors(): string[] {
		return all<{ actor: string }>(
			this.db,
			'SELECT DISTINCT actor FROM agent_sessions ORDER BY actor'
		).map((row) => row.actor);
	}

	exists(id: string): boolean {
		return !!one(this.db, 'SELECT 1 AS found FROM agent_sessions WHERE id = :id', { id });
	}

	setSummary(id: string, summary: string | null) {
		run(this.db, 'UPDATE agent_sessions SET summary = :summary WHERE id = :id', { id, summary });
	}

	find(id: string): SessionSummary | null {
		const row = one<SessionRow>(this.db, 'SELECT * FROM agent_sessions WHERE id = :id', { id });
		return row ? this.summarize([row])[0] : null;
	}

	/** The most recently seen session that recorded activity. */
	latestId(filter: LatestFilter): string | null {
		const where = ['EXISTS (SELECT 1 FROM activity a WHERE a.session_id = s.id)'];
		const params: Params = {};
		if (filter.actor) {
			where.push('s.actor = :actor');
			params.actor = filter.actor;
		}
		if (filter.projectId) {
			where.push(
				'EXISTS (SELECT 1 FROM activity a WHERE a.session_id = s.id AND a.project_id = :projectId)'
			);
			params.projectId = filter.projectId;
		}
		if (filter.excludeId) {
			where.push('s.id <> :excludeId');
			params.excludeId = filter.excludeId;
		}
		return (
			one<{ id: string }>(
				this.db,
				`SELECT s.id FROM agent_sessions s WHERE ${where.join(' AND ')}
				 ORDER BY s.last_seen_at DESC, s.id LIMIT 1`,
				params
			)?.id ?? null
		);
	}

	list(filter: SessionFilter): { items: SessionSummary[]; total: number } {
		const where: string[] = [];
		const params: Params = {};
		if (filter.actor) {
			where.push('s.actor = :actor');
			params.actor = filter.actor;
		}
		if (!filter.includeEmpty)
			where.push('EXISTS (SELECT 1 FROM activity a WHERE a.session_id = s.id)');
		const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
		const total = one<{ n: number }>(
			this.db,
			`SELECT COUNT(*) AS n FROM agent_sessions s ${clause}`,
			params
		)!.n;
		const rows = all<SessionRow>(
			this.db,
			`SELECT s.* FROM agent_sessions s ${clause}
			 ORDER BY s.started_at DESC, s.id LIMIT :limit OFFSET :offset`,
			{ ...params, limit: filter.limit, offset: filter.offset }
		);
		return { items: this.summarize(rows), total };
	}

	private summarize(rows: SessionRow[]): SessionSummary[] {
		if (rows.length === 0) return [];
		const params: Params = {};
		const marks = rows.map((row, i) => {
			params[`s${i}`] = row.id;
			return `:s${i}`;
		});
		const stats = new Map(
			all<StatsRow>(
				this.db,
				`SELECT session_id,
					COUNT(*) AS activity_count,
					SUM(action = 'task.stage_changed') AS stage_changes,
					COUNT(DISTINCT CASE WHEN action = 'task.stage_changed'
						AND json_extract(data, '$.stage') = 'deploy' AND json_extract(data, '$.to') = 'done'
						THEN task_id END) AS tasks_done,
					SUM(action = 'task.created') AS tasks_created,
					SUM(action = 'epic.created') AS epics_created,
					SUM(action = 'spec.created') AS specs_added,
					SUM(action = 'spec.updated') AS specs_updated,
					SUM(CASE WHEN action = 'question.added'
						THEN COALESCE(json_extract(data, '$.count'), 1) ELSE 0 END) AS threads_opened,
					SUM(action = 'question.replied') AS replies,
					SUM(action = 'question.answered') AS answers
				 FROM activity WHERE session_id IN (${marks.join(', ')}) GROUP BY session_id`,
				params
			).map((row) => [row.session_id, row])
		);
		const projects = new Map<string, SessionSummary['projects']>();
		for (const row of all<ProjectRow>(
			this.db,
			`SELECT DISTINCT a.session_id, p.id, p.key, p.name
			 FROM activity a JOIN projects p ON p.id = a.project_id
			 WHERE a.session_id IN (${marks.join(', ')}) ORDER BY p.key`,
			params
		)) {
			const list = projects.get(row.session_id) ?? [];
			list.push({ id: row.id, key: row.key, name: row.name });
			projects.set(row.session_id, list);
		}
		return rows.map((row) => {
			const s = stats.get(row.id);
			return {
				id: row.id,
				actor: row.actor,
				clientName: row.client_name,
				clientVersion: row.client_version,
				summary: row.summary,
				startedAt: row.started_at,
				lastSeenAt: row.last_seen_at,
				endedAt: row.ended_at,
				activityCount: s?.activity_count ?? 0,
				projects: projects.get(row.id) ?? [],
				recap: s
					? {
							stageChanges: s.stage_changes,
							tasksDone: s.tasks_done,
							tasksCreated: s.tasks_created,
							epicsCreated: s.epics_created,
							specsAdded: s.specs_added,
							specsUpdated: s.specs_updated,
							threadsOpened: s.threads_opened,
							replies: s.replies,
							answers: s.answers
						}
					: { ...EMPTY_RECAP }
			};
		});
	}
}
