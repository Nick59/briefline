import type { SpecKind } from '#lib/shared/domain/constants.ts';
import type { HumanBrief, Spec, SpecSummary } from '#lib/shared/domain/types.ts';
import { all, fromJson, one, run, toJson, type Db } from '../../db/connection.ts';

interface SpecRow {
	id: string;
	epic_id: string;
	task_id: string | null;
	title: string;
	kind: string;
	content: string;
	brief: string | null;
	position: number;
	created_at: string;
	updated_at: string;
}

const toSpec = (row: SpecRow): Spec => ({
	id: row.id,
	epicId: row.epic_id,
	taskId: row.task_id,
	title: row.title,
	kind: row.kind as SpecKind,
	content: row.content,
	brief: fromJson<HumanBrief | null>(row.brief, null),
	position: row.position,
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

	find(id: string): Spec | undefined {
		const row = one<SpecRow>(this.db, 'SELECT * FROM specs WHERE id = :id', { id });
		return row && toSpec(row);
	}

	nextPosition(epicId: string, taskId: string | null): number {
		const row = one<{ next: number }>(
			this.db,
			`SELECT COALESCE(MAX(position) + 1, 0) AS next FROM specs WHERE epic_id = :epicId AND task_id IS :taskId`,
			{ epicId, taskId }
		);
		return row?.next ?? 0;
	}

	insert(spec: Spec) {
		run(
			this.db,
			`INSERT INTO specs (id, epic_id, task_id, title, kind, content, brief, position, created_at, updated_at)
			 VALUES (:id, :epicId, :taskId, :title, :kind, :content, :brief, :position, :createdAt, :updatedAt)`,
			{ ...this.#params(spec), epicId: spec.epicId, taskId: spec.taskId, createdAt: spec.createdAt }
		);
	}

	update(spec: Spec) {
		run(
			this.db,
			`UPDATE specs SET title = :title, kind = :kind, content = :content, brief = :brief, position = :position,
			 updated_at = :updatedAt WHERE id = :id`,
			this.#params(spec)
		);
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
			updatedAt: spec.updatedAt
		};
	}
}
