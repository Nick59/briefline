import type { Priority, Stage, WorkStatus } from '#lib/shared/domain/constants.ts';
import type { ExternalRef, Task } from '#lib/shared/domain/types.ts';
import { all, fromJson, one, run, toJson, type Db, type Params } from '../../db/connection.ts';

interface TaskRow {
	id: string;
	epic_id: string;
	key: string;
	title: string;
	description: string;
	summary: string;
	priority: string;
	assignee: string | null;
	dev_status: string;
	test_status: string;
	deploy_status: string;
	external_ref: string | null;
	position: number;
	comment_count: number;
	created_at: string;
	updated_at: string;
}

const toTask = (row: TaskRow): Task => ({
	id: row.id,
	epicId: row.epic_id,
	key: row.key,
	title: row.title,
	description: row.description,
	summary: row.summary,
	priority: row.priority as Priority,
	assignee: row.assignee,
	stages: {
		dev: row.dev_status as WorkStatus,
		test: row.test_status as WorkStatus,
		deploy: row.deploy_status as WorkStatus
	},
	externalRef: fromJson<ExternalRef | null>(row.external_ref, null),
	position: row.position,
	commentCount: row.comment_count,
	createdAt: row.created_at,
	updatedAt: row.updated_at
});

export interface TaskFilter {
	stage?: Stage;
	status?: WorkStatus;
}

const STAGE_COLUMN: Record<Stage, string> = {
	dev: 'dev_status',
	test: 'test_status',
	deploy: 'deploy_status'
};

const SELECT_TASK = `SELECT t.*, (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id) AS comment_count FROM tasks t`;

export class TaskRepository {
	constructor(private readonly db: Db) {}

	listByEpic(epicId: string, filter: TaskFilter = {}): Task[] {
		const where = ['t.epic_id = :epicId'];
		const params: Params = { epicId };
		if (filter.status) {
			where.push(`t.${STAGE_COLUMN[filter.stage ?? 'dev']} = :status`);
			params.status = filter.status;
		}
		return all<TaskRow>(
			this.db,
			`${SELECT_TASK} WHERE ${where.join(' AND ')} ORDER BY t.position`,
			params
		).map(toTask);
	}

	listByProject(projectId: string): Task[] {
		return all<TaskRow>(
			this.db,
			`${SELECT_TASK} JOIN epics e ON e.id = t.epic_id WHERE e.project_id = :projectId`,
			{ projectId }
		).map(toTask);
	}

	find(idOrKey: string): Task | undefined {
		const row = one<TaskRow>(this.db, `${SELECT_TASK} WHERE t.id = :v OR t.key = upper(:v)`, {
			v: idOrKey
		});
		return row && toTask(row);
	}

	findByExternalKey(keys: string[]): Task[] {
		if (keys.length === 0) return [];
		const marks = keys.map((_, i) => `:k${i}`).join(', ');
		const params = Object.fromEntries(keys.map((key, i) => [`k${i}`, key]));
		return all<TaskRow>(
			this.db,
			`${SELECT_TASK} WHERE json_extract(t.external_ref, '$.key') COLLATE NOCASE IN (${marks}) ORDER BY t.key`,
			params
		).map(toTask);
	}

	/** Key prefix matches rank before title matches. `text` must already have LIKE wildcards escaped. */
	searchByText(text: string, limit: number): Task[] {
		return all<TaskRow>(
			this.db,
			`${SELECT_TASK}
			 WHERE t.key LIKE :prefix ESCAPE '\\' OR t.title LIKE :contains ESCAPE '\\'
			 ORDER BY CASE WHEN t.key LIKE :prefix ESCAPE '\\' THEN 0 ELSE 1 END, t.updated_at DESC, t.key
			 LIMIT :limit`,
			{ prefix: `${text}%`, contains: `%${text}%`, limit }
		).map(toTask);
	}

	nextPosition(epicId: string): number {
		const row = one<{ next: number }>(
			this.db,
			'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM tasks WHERE epic_id = :epicId',
			{
				epicId
			}
		);
		return row?.next ?? 0;
	}

	insert(task: Task) {
		run(
			this.db,
			`INSERT INTO tasks (id, epic_id, key, title, description, summary, priority, assignee, dev_status,
			 test_status, deploy_status, external_ref, position, created_at, updated_at)
			 VALUES (:id, :epicId, :key, :title, :description, :summary, :priority, :assignee, :dev, :test,
			 :deploy, :externalRef, :position, :createdAt, :updatedAt)`,
			{ ...this.#params(task), epicId: task.epicId, key: task.key, createdAt: task.createdAt }
		);
	}

	update(task: Task) {
		run(
			this.db,
			`UPDATE tasks SET epic_id = :epicId, title = :title, description = :description, summary = :summary,
			 priority = :priority, assignee = :assignee, dev_status = :dev, test_status = :test, deploy_status = :deploy,
			 external_ref = :externalRef, position = :position, updated_at = :updatedAt WHERE id = :id`,
			this.#params(task)
		);
	}

	setPosition(id: string, position: number) {
		run(this.db, 'UPDATE tasks SET position = :position WHERE id = :id', { id, position });
	}

	delete(id: string) {
		run(this.db, 'DELETE FROM tasks WHERE id = :id', { id });
	}

	#params(task: Task) {
		return {
			id: task.id,
			epicId: task.epicId,
			title: task.title,
			description: task.description,
			summary: task.summary,
			priority: task.priority,
			assignee: task.assignee,
			dev: task.stages.dev,
			test: task.stages.test,
			deploy: task.stages.deploy,
			externalRef: toJson(task.externalRef),
			position: task.position,
			updatedAt: task.updatedAt
		};
	}
}
