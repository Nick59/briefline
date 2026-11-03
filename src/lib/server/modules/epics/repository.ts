import type { Epic, ExternalRef } from '#lib/shared/domain/types.ts';
import { all, fromJson, one, run, toJson, type Db } from '../../db/connection.ts';

interface EpicRow {
	specs_approved_at: string | null;
	specs_approved_by: string | null;
	id: string;
	project_id: string;
	key: string;
	title: string;
	summary: string;
	external_ref: string | null;
	target_date: string | null;
	position: number;
	created_at: string;
	updated_at: string;
}

const toEpic = (row: EpicRow): Epic => ({
	id: row.id,
	specsApprovedAt: row.specs_approved_at,
	specsApprovedBy: row.specs_approved_by,
	projectId: row.project_id,
	key: row.key,
	title: row.title,
	summary: row.summary,
	externalRef: fromJson<ExternalRef | null>(row.external_ref, null),
	targetDate: row.target_date,
	position: row.position,
	createdAt: row.created_at,
	updatedAt: row.updated_at
});

export class EpicRepository {
	constructor(private readonly db: Db) {}

	listByProject(projectId: string): Epic[] {
		return all<EpicRow>(
			this.db,
			'SELECT * FROM epics WHERE project_id = :projectId ORDER BY position, created_at',
			{ projectId }
		).map(toEpic);
	}

	nextPosition(projectId: string): number {
		return one<{ next: number }>(
			this.db,
			'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM epics WHERE project_id = :projectId',
			{ projectId }
		)!.next;
	}

	setPosition(id: string, position: number) {
		run(this.db, 'UPDATE epics SET position = :position WHERE id = :id', { id, position });
	}

	find(idOrKey: string): Epic | undefined {
		const row = one<EpicRow>(this.db, 'SELECT * FROM epics WHERE id = :v OR key = upper(:v)', {
			v: idOrKey
		});
		return row && toEpic(row);
	}

	findByExternalKey(keys: string[]): Epic[] {
		if (keys.length === 0) return [];
		const marks = keys.map((_, i) => `:k${i}`).join(', ');
		const params = Object.fromEntries(keys.map((key, i) => [`k${i}`, key]));
		return all<EpicRow>(
			this.db,
			`SELECT * FROM epics WHERE json_extract(external_ref, '$.key') COLLATE NOCASE IN (${marks}) ORDER BY key`,
			params
		).map(toEpic);
	}

	insert(epic: Epic) {
		run(
			this.db,
			`INSERT INTO epics (id, project_id, key, title, summary, external_ref, target_date, position, created_at, updated_at, specs_approved_at, specs_approved_by)
			 VALUES (:id, :projectId, :key, :title, :summary, :externalRef, :targetDate, :position, :createdAt, :updatedAt, :specsApprovedAt, :specsApprovedBy)`,
			{
				...this.#params(epic),
				projectId: epic.projectId,
				key: epic.key,
				position: epic.position,
				createdAt: epic.createdAt
			}
		);
	}

	update(epic: Epic) {
		run(
			this.db,
			`UPDATE epics SET title = :title, summary = :summary, external_ref = :externalRef, target_date = :targetDate,
			 specs_approved_at = :specsApprovedAt, specs_approved_by = :specsApprovedBy, updated_at = :updatedAt WHERE id = :id`,
			this.#params(epic)
		);
	}

	delete(id: string) {
		run(this.db, 'DELETE FROM epics WHERE id = :id', { id });
	}

	#params(epic: Epic) {
		return {
			id: epic.id,
			specsApprovedAt: epic.specsApprovedAt,
			specsApprovedBy: epic.specsApprovedBy,
			title: epic.title,
			summary: epic.summary,
			externalRef: toJson(epic.externalRef),
			targetDate: epic.targetDate,
			updatedAt: epic.updatedAt
		};
	}
}
