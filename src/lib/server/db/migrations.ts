export const MIGRATIONS: string[] = [
	`
	CREATE TABLE projects (
		id TEXT PRIMARY KEY,
		key TEXT NOT NULL UNIQUE,
		name TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		ticketing TEXT,
		epic_seq INTEGER NOT NULL DEFAULT 0,
		task_seq INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);

	CREATE TABLE epics (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		key TEXT NOT NULL UNIQUE,
		title TEXT NOT NULL,
		summary TEXT NOT NULL DEFAULT '',
		external_ref TEXT,
		target_date TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE INDEX epics_project ON epics(project_id);

	CREATE TABLE phases (
		id TEXT PRIMARY KEY,
		epic_id TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		position INTEGER NOT NULL,
		start_date TEXT,
		end_date TEXT,
		status TEXT NOT NULL DEFAULT 'todo',
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE INDEX phases_epic ON phases(epic_id, position);

	CREATE TABLE tasks (
		id TEXT PRIMARY KEY,
		epic_id TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
		phase_id TEXT REFERENCES phases(id) ON DELETE SET NULL,
		key TEXT NOT NULL UNIQUE,
		title TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		summary TEXT NOT NULL DEFAULT '',
		priority TEXT NOT NULL DEFAULT 'medium',
		assignee TEXT,
		dev_status TEXT NOT NULL DEFAULT 'todo',
		test_status TEXT NOT NULL DEFAULT 'todo',
		deploy_status TEXT NOT NULL DEFAULT 'todo',
		external_ref TEXT,
		position INTEGER NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE INDEX tasks_epic ON tasks(epic_id, position);

	CREATE TABLE specs (
		id TEXT PRIMARY KEY,
		epic_id TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
		task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
		title TEXT NOT NULL,
		kind TEXT NOT NULL DEFAULT 'spec',
		content TEXT NOT NULL DEFAULT '',
		brief TEXT,
		position INTEGER NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE INDEX specs_owner ON specs(epic_id, task_id, position);

	CREATE TABLE activity (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		epic_id TEXT,
		task_id TEXT,
		actor TEXT NOT NULL,
		action TEXT NOT NULL,
		message TEXT NOT NULL,
		data TEXT NOT NULL DEFAULT '{}',
		created_at TEXT NOT NULL
	);
	CREATE INDEX activity_project ON activity(project_id, created_at);
	CREATE INDEX activity_epic ON activity(epic_id, created_at);

	CREATE TABLE sync_jobs (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		epic_id TEXT,
		task_id TEXT,
		provider TEXT NOT NULL,
		operation TEXT NOT NULL,
		payload TEXT NOT NULL DEFAULT '{}',
		status TEXT NOT NULL DEFAULT 'pending',
		attempts INTEGER NOT NULL DEFAULT 0,
		last_error TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE INDEX sync_jobs_status ON sync_jobs(status, created_at);
	CREATE INDEX sync_jobs_epic ON sync_jobs(epic_id, created_at);
	`
];
