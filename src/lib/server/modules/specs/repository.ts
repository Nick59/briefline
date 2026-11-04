import type { SpecKind } from '#lib/shared/domain/constants.ts';
import type { HumanBrief, Spec, SpecSummary } from '#lib/shared/domain/types.ts';
import { all, fromJson, one, run, toJson, type Db } from '../../db/connection.ts';

interface SpecRow {
	id: string;
	epic_id: string | null;
	project_id: string | null;
	task_id: string | null;
	title: string;
	kind: string;
	content: string;
	brief: string | null;
	position: number;
	viewed_at: string | null;
	created_at: string;
	updated_at: string;
}

const toSpec = (row: SpecRow): Spec => ({
	id: row.id,
	epicId: row.epic_id,
	projectId: row.project_id,
	taskId: row.task_id,
	title: row.title,
	kind: row.kind as SpecKind,
	content: row.content,
	brief: fromJson<HumanBrief | null>(row.brief, null),
	position: row.position,
	viewedAt: row.viewed_at,
	createdAt: row.created_at,
	updatedAt: row.updated_at
});

export const toSpecSummary = ({ content: _content, brief, ...rest }: Spec): SpecSummary => ({
	...rest,
	hasBrief: brief !== null
});

export class SpecRepository {
	constructor(private readonly db: Db) {}

	/** taskId undefined = every spec of the epic; null = epic-level specs only. */
	listByEpic(epicId: string, taskId?: string | null): Spec[] {
		const filter =
			taskId === undefined ? '' : taskId === null ? 'AND task_id IS NULL' : 'AND task_id = :taskId';
		const params: Record<string, string> = taskId ? { epicId, taskId } : { epicId };
		return all<SpecRow>(
			this.db,
			`SELECT * FROM specs WHERE epic_id = :epicId ${filter} ORDER BY task_id IS NOT NULL, position, created_at`,
			params
		).map(toSpec);
	}

	/** Counts epic-level and task-level specs. */
	countByEpic(epicId: string): number {
		return (
			one<{ n: number }>(this.db, 'SELECT COUNT(*) AS n FROM specs WHERE epic_id = :epicId', {
				epicId
			})?.n ?? 0
		);
	}

	listByProject(projectId: string): Spec[] {
		return all<SpecRow>(
			this.db,
			'SELECT * FROM specs WHERE project_id = :projectId ORDER BY position, created_at',
			{ projectId }
		).map(toSpec);
	}

	find(id: string): Spec | undefined {
		const row = one<SpecRow>(this.db, 'SELECT * FROM specs WHERE id = :id', { id });
		return row && toSpec(row);
	}

	nextPosition(owner: { epicId: string; taskId: string | null } | { projectId: string }): number {
		const row =
			'projectId' in owner
				? one<{ next: number }>(
						this.db,
						'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM specs WHERE project_id = :projectId',
						owner
					)
				: one<{ next: number }>(
						this.db,
						'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM specs WHERE epic_id = :epicId AND task_id IS :taskId',
						owner
					);
		return row?.next ?? 0;
	}

	insert(spec: Spec) {
		run(
			this.db,
			`INSERT INTO specs (id, epic_id, project_id, task_id, title, kind, content, brief, position, viewed_at, created_at, updated_at)
			 VALUES (:id, :epicId, :projectId, :taskId, :title, :kind, :content, :brief, :position, :viewedAt, :createdAt, :updatedAt)`,
			{
				...this.#params(spec),
				epicId: spec.epicId,
				projectId: spec.projectId,
				taskId: spec.taskId,
				createdAt: spec.createdAt
			}
		);
	}

	update(spec: Spec) {
		run(
			this.db,
			`UPDATE specs SET title = :title, kind = :kind, content = :content, brief = :brief, position = :position,
			 viewed_at = :viewedAt, updated_at = :updatedAt WHERE id = :id`,
			this.#params(spec)
		);
	}

	markViewed(id: string, viewedAt: string) {
		run(this.db, 'UPDATE specs SET viewed_at = :viewedAt WHERE id = :id', { id, viewedAt });
	}

	delete(id: string) {
		run(this.db, 'DELETE FROM specs WHERE id = :id', { id });
	}

	#params(spec: Spec) {
		return {
			id: spec.id,
			title: spec.title,
			kind: spec.kind,
			content: spec.content,
			brief: toJson(spec.brief),
			position: spec.position,
			viewedAt: spec.viewedAt,
			updatedAt: spec.updatedAt
		};
	}
}
