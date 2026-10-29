import type { Epic, ExternalRef } from '#lib/shared/domain/types.ts';
import { all, fromJson, one, run, toJson, type Db } from '../../db/connection.ts';

interface EpicRow {
	id: string;
	project_id: string;
	key: string;
	title: string;
	summary: string;
	external_ref: string | null;
	target_date: string | null;
	created_at: string;
	updated_at: string;
}

const toEpic = (row: EpicRow): Epic => ({
	id: row.id,
	projectId: row.project_id,
	key: row.key,
	title: row.title,
	summary: row.summary,
	externalRef: fromJson<ExternalRef | null>(row.external_ref, null),
	targetDate: row.target_date,
	createdAt: row.created_at,
	updatedAt: row.updated_at
});

export class EpicRepository {
	constructor(private readonly db: Db) {}

	listByProject(projectId: string): Epic[] {
		return all<EpicRow>(
			this.db,
			'SELECT * FROM epics WHERE project_id = :projectId ORDER BY created_at DESC',
			{
				projectId
			}
		).map(toEpic);
	}

	find(idOrKey: string): Epic | undefined {
		const row = one<EpicRow>(this.db, 'SELECT * FROM epics WHERE id = :v OR key = upper(:v)', {
			v: idOrKey
		});
		return row && toEpic(row);
	}

	insert(epic: Epic) {
		run(
			this.db,
			`INSERT INTO epics (id, project_id, key, title, summary, external_ref, target_date, created_at, updated_at)
			 VALUES (:id, :projectId, :key, :title, :summary, :externalRef, :targetDate, :createdAt, :updatedAt)`,
			{ ...this.#params(epic), projectId: epic.projectId, key: epic.key, createdAt: epic.createdAt }
		);
	}

	update(epic: Epic) {
		run(
			this.db,
			`UPDATE epics SET title = :title, summary = :summary, external_ref = :externalRef, target_date = :targetDate,
			 updated_at = :updatedAt WHERE id = :id`,
			this.#params(epic)
		);
	}

	delete(id: string) {
		run(this.db, 'DELETE FROM epics WHERE id = :id', { id });
	}

	#params(epic: Epic) {
		return {
			id: epic.id,
			title: epic.title,
			summary: epic.summary,
			externalRef: toJson(epic.externalRef),
			targetDate: epic.targetDate,
			updatedAt: epic.updatedAt
		};
	}
}
