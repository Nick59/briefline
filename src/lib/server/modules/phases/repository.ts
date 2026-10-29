import type { WorkStatus } from '#lib/shared/domain/constants.ts';
import type { Phase } from '#lib/shared/domain/types.ts';
import { all, one, run, type Db } from '../../db/connection.ts';

interface PhaseRow {
	id: string;
	epic_id: string;
	name: string;
	description: string;
	position: number;
	start_date: string | null;
	end_date: string | null;
	status: string;
	created_at: string;
	updated_at: string;
}

const toPhase = (row: PhaseRow): Phase => ({
	id: row.id,
	epicId: row.epic_id,
	name: row.name,
	description: row.description,
	position: row.position,
	startDate: row.start_date,
	endDate: row.end_date,
	status: row.status as WorkStatus,
	createdAt: row.created_at,
	updatedAt: row.updated_at
});

export class PhaseRepository {
	constructor(private readonly db: Db) {}

	listByEpic(epicId: string): Phase[] {
		return all<PhaseRow>(
			this.db,
			'SELECT * FROM phases WHERE epic_id = :epicId ORDER BY position',
			{ epicId }
		).map(toPhase);
	}

	find(id: string): Phase | undefined {
		const row = one<PhaseRow>(this.db, 'SELECT * FROM phases WHERE id = :id', { id });
		return row && toPhase(row);
	}

	findByName(epicId: string, name: string): Phase | undefined {
		const row = one<PhaseRow>(
			this.db,
			'SELECT * FROM phases WHERE epic_id = :epicId AND lower(name) = lower(:name)',
			{
				epicId,
				name
			}
		);
		return row && toPhase(row);
	}

	nextPosition(epicId: string): number {
		const row = one<{ next: number }>(
			this.db,
			'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM phases WHERE epic_id = :epicId',
			{
				epicId
			}
		);
		return row?.next ?? 0;
	}

	insert(phase: Phase) {
		run(
			this.db,
			`INSERT INTO phases (id, epic_id, name, description, position, start_date, end_date, status, created_at, updated_at)
			 VALUES (:id, :epicId, :name, :description, :position, :startDate, :endDate, :status, :createdAt, :updatedAt)`,
			{ ...this.#params(phase), epicId: phase.epicId, createdAt: phase.createdAt }
		);
	}

	update(phase: Phase) {
		run(
			this.db,
			`UPDATE phases SET name = :name, description = :description, position = :position, start_date = :startDate,
			 end_date = :endDate, status = :status, updated_at = :updatedAt WHERE id = :id`,
			this.#params(phase)
		);
	}

	delete(id: string) {
		run(this.db, 'DELETE FROM phases WHERE id = :id', { id });
	}

	#params(phase: Phase) {
		return {
			id: phase.id,
			name: phase.name,
			description: phase.description,
			position: phase.position,
			startDate: phase.startDate,
			endDate: phase.endDate,
			status: phase.status,
			updatedAt: phase.updatedAt
		};
	}
}
