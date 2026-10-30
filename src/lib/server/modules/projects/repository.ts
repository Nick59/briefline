import type { Project, StatusMapping } from '#lib/shared/domain/types.ts';
import { all, fromJson, one, run, toJson, type Db } from '../../db/connection.ts';

interface ProjectRow {
	id: string;
	key: string;
	name: string;
	description: string;
	ticketing_connection_id: string | null;
	ticketing_provider: string | null;
	ticketing_target: string;
	status_mapping: string;
	ticketing_auto_sync: number;
	ticketing_post_comments: number;
	created_at: string;
	updated_at: string;
}

const toProject = (row: ProjectRow): Project => ({
	id: row.id,
	key: row.key,
	name: row.name,
	description: row.description,
	ticketing: {
		connectionId: row.ticketing_connection_id,
		provider: row.ticketing_provider,
		target: fromJson<Record<string, string>>(row.ticketing_target, {}),
		statusMapping: fromJson<StatusMapping>(row.status_mapping, {}),
		autoSync: row.ticketing_auto_sync !== 0,
		postComments: row.ticketing_post_comments !== 0
	},
	createdAt: row.created_at,
	updatedAt: row.updated_at
});

const SELECT = `SELECT p.*, c.provider AS ticketing_provider FROM projects p
	LEFT JOIN ticketing_connections c ON c.id = p.ticketing_connection_id`;

export class ProjectRepository {
	constructor(private readonly db: Db) {}

	list(): Project[] {
		return all<ProjectRow>(this.db, `${SELECT} ORDER BY p.name`).map(toProject);
	}

	find(idOrKey: string): Project | undefined {
		const row = one<ProjectRow>(this.db, `${SELECT} WHERE p.id = :v OR p.key = upper(:v)`, {
			v: idOrKey
		});
		return row && toProject(row);
	}

	keyExists(key: string): boolean {
		return one(this.db, 'SELECT 1 FROM projects WHERE key = :key', { key }) !== undefined;
	}

	insert(project: Project) {
		run(
			this.db,
			`INSERT INTO projects (id, key, name, description, ticketing_connection_id, ticketing_target, status_mapping,
			 ticketing_auto_sync, ticketing_post_comments, created_at, updated_at)
			 VALUES (:id, :key, :name, :description, :connectionId, :target, :statusMapping, :autoSync, :postComments,
			 :createdAt, :updatedAt)`,
			{ ...this.#params(project), key: project.key, createdAt: project.createdAt }
		);
	}

	update(project: Project) {
		run(
			this.db,
			`UPDATE projects SET name = :name, description = :description, ticketing_connection_id = :connectionId,
			 ticketing_target = :target, status_mapping = :statusMapping, ticketing_auto_sync = :autoSync,
			 ticketing_post_comments = :postComments, updated_at = :updatedAt WHERE id = :id`,
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
			connectionId: project.ticketing.connectionId,
			target: toJson(project.ticketing.target) ?? '{}',
			statusMapping: toJson(project.ticketing.statusMapping) ?? '{}',
			autoSync: project.ticketing.autoSync ? 1 : 0,
			postComments: project.ticketing.postComments ? 1 : 0,
			updatedAt: project.updatedAt
		};
	}
}
