import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../config.ts';
import { createContainer } from '../container.ts';
import { migrate } from './connection.ts';

describe('migration that removes phases', () => {
	function legacyDb() {
		const db = new DatabaseSync(':memory:');
		db.exec('PRAGMA foreign_keys = ON');
		migrate(db, 2);
		db.exec(`
			INSERT INTO projects (id, key, name, created_at, updated_at) VALUES ('p1', 'PMA', 'PM', 't', 't');
			INSERT INTO epics (id, project_id, key, title, created_at, updated_at)
				VALUES ('e1', 'p1', 'PMA-E1', 'Epic', 't', 't');
			INSERT INTO phases (id, epic_id, name, position, created_at, updated_at)
				VALUES ('ph1', 'e1', 'Build', 0, 't', 't');
			INSERT INTO tasks (id, epic_id, phase_id, key, title, description, summary, priority, assignee,
				dev_status, test_status, deploy_status, external_ref, position, created_at, updated_at)
				VALUES ('t1', 'e1', 'ph1', 'PMA-1', 'One', 'd', 's', 'high', 'bot', 'done', 'in_progress',
				'todo', '{"provider":"x","key":"K"}', 0, 'c', 'u'),
				('t2', 'e1', NULL, 'PMA-2', 'Two', '', '', 'medium', NULL, 'todo', 'todo', 'todo', NULL, 1, 'c', 'u');
			INSERT INTO specs (id, epic_id, task_id, title, position, created_at, updated_at)
				VALUES ('s1', 'e1', 't1', 'Spec', 0, 't', 't');
		`);
		return db;
	}

	const names = (db: DatabaseSync, type: string) =>
		(
			db.prepare('SELECT name FROM sqlite_master WHERE type = ?').all(type) as { name: string }[]
		).map((row) => row.name);

	it('keeps tasks and specs intact and removes the phases table and column', () => {
		const db = legacyDb();
		const before = db.prepare('SELECT * FROM tasks ORDER BY position').all() as Record<
			string,
			unknown
		>[];
		migrate(db);

		const after = db.prepare('SELECT * FROM tasks ORDER BY position').all();
		expect(after).toEqual(before.map(({ phase_id: _removed, ...row }) => row));
		expect(names(db, 'table')).not.toContain('phases');
		expect(names(db, 'index')).toContain('tasks_epic');
		expect(names(db, 'index')).not.toContain('phases_epic');
		expect(db.prepare('SELECT id, task_id FROM specs').all()).toEqual([
			{ id: 's1', task_id: 't1' }
		]);
		expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
		expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 4 });
	});

	it('still cascades task deletion to specs afterwards', () => {
		const db = legacyDb();
		migrate(db);
		db.exec("DELETE FROM tasks WHERE id = 't1'");
		expect(db.prepare('SELECT COUNT(*) AS n FROM specs').get()).toEqual({ n: 0 });
	});

	it('keeps legacy phase activity readable from its stored message', () => {
		const db = legacyDb();
		db.exec(`INSERT INTO activity (id, project_id, epic_id, actor, action, message, data, created_at)
			VALUES ('a1', 'p1', 'e1', 'bot', 'phase.created', 'Added phase "Build"', '{"name":"Build"}', 't')`);
		migrate(db);
		const app = createContainer(db, { config: readConfig({}), env: {}, fetch });
		expect(app.activity.forEpic('PMA-E1').items).toMatchObject([
			{ action: 'phase.created', message: 'Added phase "Build"' }
		]);
	});
});

describe('headers column migration', () => {
	it('adds a nullable headers_ciphertext column and keeps existing connections', () => {
		const db = new DatabaseSync(':memory:');
		migrate(db, 3);
		db.exec(
			"INSERT INTO ticketing_connections (id, name, provider, created_at, updated_at) VALUES ('c1', 'GH', 'github', 't', 't')"
		);
		migrate(db);
		expect(db.prepare('SELECT id, headers_ciphertext FROM ticketing_connections').all()).toEqual([
			{ id: 'c1', headers_ciphertext: null }
		]);
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 4 });
	});
});
