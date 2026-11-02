import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../testing/app.ts';
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
		expect(after).toEqual(
			before.map(({ phase_id: _removed, ...row }) => ({ ...row, cancelled_at: null }))
		);
		expect(names(db, 'table')).not.toContain('phases');
		expect(names(db, 'index')).toContain('tasks_epic');
		expect(names(db, 'index')).not.toContain('phases_epic');
		expect(db.prepare('SELECT id, task_id FROM specs').all()).toEqual([
			{ id: 's1', task_id: 't1' }
		]);
		expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
		expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 17 });
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
		const app = createContainer(db, { config: testConfig(), env: {}, fetch });
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
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 17 });
	});
});

describe('project specs migration', () => {
	it('keeps existing specs, marks them not viewed and allows project specs', () => {
		const db = new DatabaseSync(':memory:');
		db.exec('PRAGMA foreign_keys = ON');
		migrate(db, 4);
		db.exec(`
			INSERT INTO projects (id, key, name, created_at, updated_at) VALUES ('p1', 'PMA', 'PM', 't', 't');
			INSERT INTO epics (id, project_id, key, title, created_at, updated_at)
				VALUES ('e1', 'p1', 'PMA-E1', 'Epic', 't', 't');
			INSERT INTO specs (id, epic_id, title, content, position, created_at, updated_at)
				VALUES ('s1', 'e1', 'Spec', 'body', 0, 't', 't');
		`);
		migrate(db);
		expect(
			db.prepare('SELECT id, epic_id, project_id, content, viewed_at FROM specs').all()
		).toEqual([{ id: 's1', epic_id: 'e1', project_id: null, content: 'body', viewed_at: null }]);
		db.exec(`INSERT INTO specs (id, project_id, title, position, created_at, updated_at)
			VALUES ('s2', 'p1', 'Project spec', 0, 't', 't')`);
		expect(() =>
			db.exec(
				`INSERT INTO specs (id, title, position, created_at, updated_at) VALUES ('s3', 'x', 0, 't', 't')`
			)
		).toThrow();
		expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 17 });
		db.exec("DELETE FROM epics WHERE id = 'e1'");
		expect(db.prepare('SELECT id FROM specs').all()).toEqual([{ id: 's2' }]);
	});
	it('adds epic questions to an existing database and cascades them with the epic', () => {
		const db = new DatabaseSync(':memory:');
		db.exec('PRAGMA foreign_keys = ON');
		migrate(db, 5);
		db.exec(`
			INSERT INTO projects (id, key, name, created_at, updated_at) VALUES ('p1', 'PMA', 'PM', 't', 't');
			INSERT INTO epics (id, project_id, key, title, created_at, updated_at)
				VALUES ('e1', 'p1', 'PMA-E1', 'Epic', 't', 't');
		`);
		migrate(db);
		db.exec(`INSERT INTO epic_questions (id, epic_id, position, question, asked_by, created_at)
			VALUES ('q1', 'e1', 0, 'Which?', 'claude', 't')`);
		expect(db.prepare('SELECT status, answer FROM epic_questions').all()).toEqual([
			{ status: 'open', answer: null }
		]);
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 17 });
		db.exec("DELETE FROM epics WHERE id = 'e1'");
		expect(db.prepare('SELECT id FROM epic_questions').all()).toEqual([]);
	});
	it('adds question messages that cascade with their question', () => {
		const db = new DatabaseSync(':memory:');
		db.exec('PRAGMA foreign_keys = ON');
		migrate(db);
		db.exec(`
			INSERT INTO projects (id, key, name, created_at, updated_at) VALUES ('p1', 'PMA', 'PM', 't', 't');
			INSERT INTO epics (id, project_id, key, title, created_at, updated_at)
				VALUES ('e1', 'p1', 'PMA-E1', 'Epic', 't', 't');
			INSERT INTO epic_questions (id, epic_id, position, question, asked_by, created_at)
				VALUES ('q1', 'e1', 0, 'Which?', 'claude', 't');
			INSERT INTO question_messages (id, question_id, author, body, created_at)
				VALUES ('m1', 'q1', 'nick', 'Hello', 't');
		`);
		expect(db.prepare('SELECT author, body FROM question_messages').all()).toEqual([
			{ author: 'nick', body: 'Hello' }
		]);
		db.exec("DELETE FROM epic_questions WHERE id = 'q1'");
		expect(db.prepare('SELECT id FROM question_messages').all()).toEqual([]);
	});
});

describe('activity cursor and profile migrations', () => {
	it('numbers existing activity in order, continues the counter and adds the new tables', () => {
		const db = new DatabaseSync(':memory:');
		db.exec('PRAGMA foreign_keys = ON');
		migrate(db, 6);
		db.exec(`
			INSERT INTO projects (id, key, name, created_at, updated_at) VALUES ('p1', 'PMA', 'PM', 't', 't');
			INSERT INTO activity (id, project_id, actor, action, message, created_at)
				VALUES ('a1', 'p1', 'bot', 'project.created', 'one', 't'),
				       ('a2', 'p1', 'bot', 'project.updated', 'two', 't');
		`);
		migrate(db);
		expect(db.prepare('SELECT id, seq FROM activity ORDER BY seq').all()).toEqual([
			{ id: 'a1', seq: 1 },
			{ id: 'a2', seq: 2 }
		]);
		const app = createContainer(db, { config: testConfig(), env: {}, fetch });
		app.projects.update('PMA', { name: 'Renamed' }, 'bot');
		expect(
			app.activity.changes({ since: 'act_1', excludeOwn: false, limit: 10 }, null).items
		).toHaveLength(2);
		expect(app.profile.get()).toBeNull();
		const tables = (
			db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
		).map((row) => row.name);
		expect(tables).toEqual(
			expect.arrayContaining(['activity_counter', 'activity_cursors', 'user_profile'])
		);
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 17 });
	});
});

describe('project order migration', () => {
	it('keeps the previous by-name order as the initial position', () => {
		const db = new DatabaseSync(':memory:');
		migrate(db, 8);
		db.exec(`
			INSERT INTO projects (id, key, name, created_at, updated_at) VALUES
				('p1', 'ZED', 'Zed', 't', 't'), ('p2', 'ALP', 'Alpha', 't', 't'),
				('p3', 'MID', 'Middle', 't', 't'), ('p4', 'BET', 'Beta', 't', 't');
		`);
		migrate(db);
		const rows = db.prepare('SELECT key, position FROM projects ORDER BY position').all();
		expect(rows).toEqual([
			{ key: 'ALP', position: 0 },
			{ key: 'BET', position: 1 },
			{ key: 'MID', position: 2 },
			{ key: 'ZED', position: 3 }
		]);
		const app = createContainer(db, { config: testConfig(), env: {}, fetch });
		expect(app.projects.list().map((p) => p.key)).toEqual(['ALP', 'BET', 'MID', 'ZED']);
		app.projects.create({ key: 'NEW', name: 'Aaa' }, 'test');
		expect(app.projects.list().map((p) => p.key)).toEqual(['ALP', 'BET', 'MID', 'ZED', 'NEW']);
	});
});

describe('agent sessions migration', () => {
	it('adds the sessions table and leaves existing activity without a session', () => {
		const db = new DatabaseSync(':memory:');
		migrate(db, 11);
		db.exec(`
			INSERT INTO projects (id, key, name, created_at, updated_at) VALUES ('p1', 'PMA', 'PM', 't', 't');
			INSERT INTO activity (id, project_id, actor, action, message, created_at)
				VALUES ('a1', 'p1', 'bot', 'project.created', 'one', 't');
		`);
		migrate(db);
		expect(db.prepare('SELECT id, session_id FROM activity').all()).toEqual([
			{ id: 'a1', session_id: null }
		]);
		const columns = (
			db.prepare('PRAGMA table_info(agent_sessions)').all() as { name: string }[]
		).map((c) => c.name);
		expect(columns).toEqual([
			'id',
			'actor',
			'client_name',
			'client_version',
			'summary',
			'started_at',
			'last_seen_at',
			'ended_at'
		]);
		const indexes = (
			db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]
		).map((row) => row.name);
		expect(indexes).toEqual(expect.arrayContaining(['agent_sessions_started', 'activity_session']));
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 17 });
	});
});

describe('task comments migration', () => {
	it('adds the table, keeps existing tasks and cascades with the task', () => {
		const db = new DatabaseSync(':memory:');
		migrate(db, 12);
		db.exec(`
	    INSERT INTO projects (id, key, name, created_at, updated_at) VALUES ('p1', 'PMA', 'PM', 't', 't');
	    INSERT INTO epics (id, project_id, key, title, created_at, updated_at)
	      VALUES ('e1', 'p1', 'PMA-E1', 'Epic', 't', 't');
	    INSERT INTO tasks (id, epic_id, key, title, position, created_at, updated_at)
	      VALUES ('t1', 'e1', 'PMA-1', 'Task', 0, 't', 't');
	  `);
		migrate(db);
		db.exec(`
	    INSERT INTO task_comments (id, task_id, author, body, created_at, updated_at)
	      VALUES ('c1', 't1', 'nick', 'hi', 't', 't');
	  `);
		expect(db.prepare('SELECT id FROM tasks').all()).toEqual([{ id: 't1' }]);
		const indexes = (
			db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]
		).map((row) => row.name);
		expect(indexes).toContain('task_comments_task');
		db.exec('PRAGMA foreign_keys = ON');
		db.exec("DELETE FROM tasks WHERE id = 't1'");
		expect(db.prepare('SELECT id FROM task_comments').all()).toEqual([]);
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 17 });
	});
});

describe('comment author kind migration', () => {
	it('marks dashboard, seed and profile-name comments as human and the rest as agent', () => {
		const db = new DatabaseSync(':memory:');
		migrate(db, 13);
		db.exec(
			`INSERT INTO projects (id, key, name, created_at, updated_at) VALUES ('p1', 'PMA', 'P', 't', 't')`
		);
		db.exec(
			"INSERT INTO epics (id, project_id, key, title, created_at, updated_at) VALUES ('e1', 'p1', 'PMA-E1', 'E', 't', 't')"
		);
		db.exec(
			"INSERT INTO tasks (id, epic_id, key, title, position, created_at, updated_at) VALUES ('t1', 'e1', 'PMA-1', 'T', 0, 't', 't')"
		);
		db.exec(
			`INSERT INTO user_profile (id, name, role, coding_level, updated_at) VALUES (1, 'Nick', 'developer', 'expert', 't')`
		);
		for (const author of ['dashboard', 'seed', 'Nick', 'claude']) {
			db.prepare(
				`INSERT INTO task_comments (id, task_id, author, body, created_at, updated_at) VALUES (?, 't1', ?, 'b', 't', 't')`
			).run(author, author);
		}
		migrate(db);
		expect(db.prepare('SELECT id, author_kind FROM task_comments ORDER BY id').all()).toEqual([
			{ id: 'Nick', author_kind: 'human' },
			{ id: 'claude', author_kind: 'agent' },
			{ id: 'dashboard', author_kind: 'human' },
			{ id: 'seed', author_kind: 'human' }
		]);
	});
});

describe('epic order migration', () => {
	it('orders existing epics by creation date within each project', () => {
		const db = new DatabaseSync(':memory:');
		migrate(db, 15);
		db.exec(`
			INSERT INTO projects (id, key, name, created_at, updated_at) VALUES ('p1', 'AAA', 'A', 't', 't');
			INSERT INTO projects (id, key, name, created_at, updated_at) VALUES ('p2', 'BBB', 'B', 't', 't');
			INSERT INTO epics (id, project_id, key, title, created_at, updated_at) VALUES ('e3', 'p1', 'AAA-E3', 'E', '2026-03', 't');
			INSERT INTO epics (id, project_id, key, title, created_at, updated_at) VALUES ('e1', 'p1', 'AAA-E1', 'E', '2026-01', 't');
			INSERT INTO epics (id, project_id, key, title, created_at, updated_at) VALUES ('e2', 'p1', 'AAA-E2', 'E', '2026-02', 't');
			INSERT INTO epics (id, project_id, key, title, created_at, updated_at) VALUES ('e4', 'p2', 'BBB-E1', 'E', '2026-04', 't');
		`);
		migrate(db);
		expect(db.prepare('SELECT key, position FROM epics ORDER BY key').all()).toEqual([
			{ key: 'AAA-E1', position: 0 },
			{ key: 'AAA-E2', position: 1 },
			{ key: 'AAA-E3', position: 2 },
			{ key: 'BBB-E1', position: 0 }
		]);
	});
});
