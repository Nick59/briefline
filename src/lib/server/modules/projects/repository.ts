import type { Project, TicketingConfig } from '#lib/shared/domain/types.ts';
import { all, fromJson, one, run, toJson, type Db } from '../../db/connection.ts';

interface ProjectRow {
	id: string;
	key: string;
	name: string;
	description: string;
	ticketing: string | null;
	created_at: string;
	updated_at: string;
}

const toProject = (row: ProjectRow): Project => ({
	id: row.id,
	key: row.key,
	name: row.name,
	description: row.description,
	ticketing: fromJson<TicketingConfig | null>(row.ticketing, null),
	createdAt: row.created_at,
	updatedAt: row.updated_at
});

export class ProjectRepository {
	constructor(private readonly db: Db) {}

	list(): Project[] {
		return all<ProjectRow>(this.db, 'SELECT * FROM projects ORDER BY name').map(toProject);
	}

	find(idOrKey: string): Project | undefined {
		const row = one<ProjectRow>(
			this.db,
			'SELECT * FROM projects WHERE id = :v OR key = upper(:v)',
			{ v: idOrKey }
		);
		return row && toProject(row);
	}

	keyExists(key: string): boolean {
		return one(this.db, 'SELECT 1 FROM projects WHERE key = :key', { key }) !== undefined;
	}

	insert(project: Project) {
		run(
			this.db,
			`INSERT INTO projects (id, key, name, description, ticketing, created_at, updated_at)
			 VALUES (:id, :key, :name, :description, :ticketing, :createdAt, :updatedAt)`,
			{ ...this.#params(project), key: project.key, createdAt: project.createdAt }
		);
	}

	update(project: Project) {
		run(
			this.db,
			`UPDATE projects SET name = :name, description = :description, ticketing = :ticketing, updated_at = :updatedAt
			 WHERE id = :id`,
			this.#params(project)
		);
	}

	delete(id: string) {
		run(this.db, 'DELETE FROM projects WHERE id = :id', { id });
	}

	nextSequence(id: string, kind: 'epic' | 'task'): number {
		const column = kind === 'epic' ? 'epic_seq' : 'task_seq';
		const row = one<{ seq: number }>(
			this.db,
			`UPDATE projects SET ${column} = ${column} + 1 WHERE id = :id RETURNING ${column} AS seq`,
			{ id }
		);
		return row!.seq;
	}

	#params(project: Project) {
		return {
			id: project.id,
			name: project.name,
			description: project.description,
			ticketing: toJson(project.ticketing),
			updatedAt: project.updatedAt
		};
	}
}
