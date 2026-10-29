import type { SyncJobStatus } from '#lib/shared/domain/constants.ts';
import type { SyncJob } from '#lib/shared/domain/types.ts';
import { all, fromJson, one, run, toJson, type Db, type Params } from '../../db/connection.ts';

interface SyncJobRow {
	id: string;
	project_id: string;
	epic_id: string | null;
	task_id: string | null;
	provider: string;
	operation: string;
	payload: string;
	status: string;
	attempts: number;
	last_error: string | null;
	created_at: string;
	updated_at: string;
}

const toJob = (row: SyncJobRow): SyncJob => ({
	id: row.id,
	projectId: row.project_id,
	epicId: row.epic_id,
	taskId: row.task_id,
	provider: row.provider,
	operation: row.operation,
	payload: fromJson<Record<string, unknown>>(row.payload, {}),
	status: row.status as SyncJobStatus,
	attempts: row.attempts,
	lastError: row.last_error,
	createdAt: row.created_at,
	updatedAt: row.updated_at
});

export interface SyncJobFilter {
	projectId?: string;
	epicId?: string;
	status?: SyncJobStatus;
	limit?: number;
}

export class SyncJobRepository {
	constructor(private readonly db: Db) {}

	insert(job: SyncJob) {
		run(
			this.db,
			`INSERT INTO sync_jobs (id, project_id, epic_id, task_id, provider, operation, payload, status, attempts, last_error,
			 created_at, updated_at) VALUES (:id, :projectId, :epicId, :taskId, :provider, :operation, :payload, :status,
			 :attempts, :lastError, :createdAt, :updatedAt)`,
			{
				id: job.id,
				projectId: job.projectId,
				epicId: job.epicId,
				taskId: job.taskId,
				provider: job.provider,
				operation: job.operation,
				payload: toJson(job.payload) ?? '{}',
				status: job.status,
				attempts: job.attempts,
				lastError: job.lastError,
				createdAt: job.createdAt,
				updatedAt: job.updatedAt
			}
		);
	}

	update(job: SyncJob) {
		run(
			this.db,
			`UPDATE sync_jobs SET status = :status, attempts = :attempts, last_error = :lastError, updated_at = :updatedAt
			 WHERE id = :id`,
			{
				id: job.id,
				status: job.status,
				attempts: job.attempts,
				lastError: job.lastError,
				updatedAt: job.updatedAt
			}
		);
	}

	find(id: string): SyncJob | undefined {
		const row = one<SyncJobRow>(this.db, 'SELECT * FROM sync_jobs WHERE id = :id', { id });
		return row && toJob(row);
	}

	list(filter: SyncJobFilter): SyncJob[] {
		const where: string[] = [];
		const params: Params = { limit: Math.min(filter.limit ?? 50, 500) };
		for (const [column, key] of [
			['project_id', 'projectId'],
			['epic_id', 'epicId'],
			['status', 'status']
		] as const) {
			const value = filter[key];
			if (value) {
				where.push(`${column} = :${key}`);
				params[key] = value;
			}
		}
		const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
		return all<SyncJobRow>(
			this.db,
			`SELECT * FROM sync_jobs ${clause} ORDER BY created_at DESC, rowid DESC LIMIT :limit`,
			params
		).map(toJob);
	}
}
