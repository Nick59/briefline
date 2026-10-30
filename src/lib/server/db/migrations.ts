import type { DatabaseSync } from 'node:sqlite';

export type Migration = string | ((db: DatabaseSync) => void);

export const MIGRATIONS: Migration[] = [
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
	`,
	migrateToTicketingConnections,
	removePhases,
	`ALTER TABLE ticketing_connections ADD COLUMN headers_ciphertext TEXT;`
];

const LEGACY_PROJECT_FIELDS: Record<string, string[]> = {
	plane: ['projectId'],
	github: ['repo'],
	jira: ['doneStatus']
};

const LEGACY_LABELS: Record<string, string> = {
	github: 'GitHub',
	jira: 'Jira',
	linear: 'Linear',
	plane: 'Plane',
	webhook: 'Webhook',
	'dry-run': 'Dry run'
};

function hostOf(value: string | undefined): string | undefined {
	if (!value) return undefined;
	try {
		return new URL(value).host;
	} catch {
		return undefined;
	}
}

/**
 * Connections replace the per-project provider settings. Projects with identical connection-level
 * settings share one connection; project-level fields move to the project's ticketing target.
 * Secrets stay in the environment: a connection without a stored secret falls back to it.
 */
function migrateToTicketingConnections(db: DatabaseSync) {
	db.exec(`
		CREATE TABLE ticketing_connections (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			provider TEXT NOT NULL,
			settings TEXT NOT NULL DEFAULT '{}',
			secret_ciphertext TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		ALTER TABLE projects ADD COLUMN ticketing_connection_id TEXT REFERENCES ticketing_connections(id) ON DELETE RESTRICT;
		ALTER TABLE projects ADD COLUMN ticketing_target TEXT NOT NULL DEFAULT '{}';
		ALTER TABLE projects ADD COLUMN status_mapping TEXT NOT NULL DEFAULT '{}';
		ALTER TABLE projects ADD COLUMN ticketing_auto_sync INTEGER NOT NULL DEFAULT 1;
		ALTER TABLE projects ADD COLUMN ticketing_post_comments INTEGER NOT NULL DEFAULT 1;
		ALTER TABLE sync_jobs ADD COLUMN message TEXT;
		CREATE INDEX projects_ticketing_connection ON projects(ticketing_connection_id);
	`);

	const rows = db
		.prepare('SELECT id, ticketing FROM projects WHERE ticketing IS NOT NULL')
		.all() as { id: string; ticketing: string }[];
	const connections = new Map<string, string>();
	const names = new Set<string>();
	const timestamp = new Date().toISOString();

	for (const row of rows) {
		let legacy: {
			provider?: string;
			settings?: Record<string, string>;
			autoSync?: boolean;
			postComments?: boolean;
		};
		try {
			legacy = JSON.parse(row.ticketing);
		} catch {
			continue;
		}
		if (!legacy?.provider) continue;

		const projectFields = LEGACY_PROJECT_FIELDS[legacy.provider] ?? [];
		const settings = legacy.settings ?? {};
		const connectionSettings = Object.fromEntries(
			Object.entries(settings).filter(([name]) => !projectFields.includes(name))
		);
		const target = Object.fromEntries(
			Object.entries(settings).filter(([name]) => projectFields.includes(name))
		);

		const fingerprint = JSON.stringify([
			legacy.provider,
			Object.entries(connectionSettings).sort()
		]);
		let connectionId = connections.get(fingerprint);
		if (!connectionId) {
			connectionId = crypto.randomUUID();
			const label = LEGACY_LABELS[legacy.provider] ?? legacy.provider;
			const detail =
				connectionSettings.workspaceSlug ??
				connectionSettings.workspace ??
				hostOf(connectionSettings.baseUrl) ??
				hostOf(connectionSettings.url);
			const base = detail ? `${label} (${detail})` : label;
			let name = base;
			for (let n = 2; names.has(name); n++) name = `${base} ${n}`;
			names.add(name);
			db.prepare(
				`INSERT INTO ticketing_connections (id, name, provider, settings, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?)`
			).run(
				connectionId,
				name,
				legacy.provider,
				JSON.stringify(connectionSettings),
				timestamp,
				timestamp
			);
			connections.set(fingerprint, connectionId);
		}

		db.prepare(
			`UPDATE projects SET ticketing_connection_id = ?, ticketing_target = ?,
			 ticketing_auto_sync = ?, ticketing_post_comments = ? WHERE id = ?`
		).run(
			connectionId,
			JSON.stringify(target),
			legacy.autoSync === false ? 0 : 1,
			legacy.postComments === false ? 0 : 1,
			row.id
		);
	}
}

/**
 * SQLite cannot drop a column that carries a foreign key, so tasks is rebuilt. The runner turns
 * foreign keys off around migrations so that replacing tasks does not cascade into specs.
 */
function removePhases(db: DatabaseSync) {
	db.exec(`
		CREATE TABLE tasks_new (
			id TEXT PRIMARY KEY,
			epic_id TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
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
		INSERT INTO tasks_new (id, epic_id, key, title, description, summary, priority, assignee,
			dev_status, test_status, deploy_status, external_ref, position, created_at, updated_at)
		SELECT id, epic_id, key, title, description, summary, priority, assignee,
			dev_status, test_status, deploy_status, external_ref, position, created_at, updated_at
		FROM tasks;
		DROP TABLE tasks;
		ALTER TABLE tasks_new RENAME TO tasks;
		CREATE INDEX tasks_epic ON tasks(epic_id, position);
		DROP TABLE phases;
	`);
}
