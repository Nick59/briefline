import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { execute } from '../../api/execute.ts';
import { operations } from '../../api/operations.ts';
import { createContainer } from '../../container.ts';
import { migrate } from '../../db/connection.ts';
import { connectProject, testApp, testConfig } from '../../testing/app.ts';

const PROJECT_UUID = '3f1c2a5e-1111-4222-8333-444455556666';
const KEY = randomBytes(32).toString('base64');
const SECRET = 'sk-live-very-secret-123';

function setup(env: Record<string, string> = { BRIEFLINE_SECRET_KEY: KEY }) {
	const ctx = testApp(env, (call) =>
		call.url.includes('/work-items/')
			? Response.json({ id: 'issue-uuid' })
			: call.url.endsWith('/states/')
				? Response.json({ results: [{ id: 's1', name: 'Started', group: 'started' }] })
				: Response.json({})
	);
	ctx.app.projects.create({ key: 'PMA', name: 'PM' }, 'test');
	return ctx;
}

const planeSettings = { workspaceSlug: 'acme', projectId: PROJECT_UUID };

describe('ticketing connections', () => {
	it('stores the secret encrypted and uses it for pushes', async () => {
		const { app, calls } = setup();
		const connection = connectProject(app, 'PMA', 'plane', planeSettings, { secret: SECRET });
		expect(connection).toMatchObject({ hasSecret: true, secretSource: 'stored' });

		expect(JSON.stringify(app.connections.list())).not.toContain(SECRET);

		const epic = app.epics.create('PMA', { title: 'E', tasks: [{ title: 'T' }] }, 'test');
		app.epics.update(epic.id, { externalRef: { provider: 'plane', key: 'SOFT-1' } }, 'test');
		await app.ticketing.idle();
		expect(calls[0].init.headers).toMatchObject({ 'x-api-key': SECRET });
	});

	it('refuses to save a secret without BRIEFLINE_SECRET_KEY', () => {
		const { app } = setup({});
		expect(() => app.connections.create({ name: 'x', provider: 'github', secret: SECRET })).toThrow(
			/BRIEFLINE_SECRET_KEY is not set/
		);
		expect(app.connections.list()).toEqual([]);
	});

	it('falls back to the environment variable and reports it', () => {
		const { app } = setup({ PLANE_API_KEY: 'from-env' });
		const connection = app.connections.create({
			name: 'Plane',
			provider: 'plane',
			settings: { workspaceSlug: 'acme' }
		});
		expect(connection).toMatchObject({ hasSecret: false, secretSource: 'env' });
		expect(setup({}).app.connections.create({ name: 'n', provider: 'github' }).secretSource).toBe(
			'none'
		);
	});

	it('keeps the secret on update unless it is replaced or cleared', () => {
		const { app } = setup();
		const { id } = app.connections.create({ name: 'GH', provider: 'github', secret: SECRET });
		expect(app.connections.update(id, { name: 'GitHub' })).toMatchObject({
			name: 'GitHub',
			hasSecret: true
		});
		expect(app.connections.update(id, { secret: '' }).hasSecret).toBe(true);
		expect(app.connections.update(id, { clearSecret: true })).toMatchObject({
			hasSecret: false,
			secretSource: 'none'
		});
		expect(() => app.connections.update(id, { secret: 'a', clearSecret: true })).toThrow(
			/not both/
		);
	});

	it('refuses to delete a connection that projects use and lists them', () => {
		const { app } = setup();
		const connection = connectProject(app, 'PMA', 'dry-run');
		expect(() => app.connections.delete(connection.id)).toThrow(/PM \(PMA\)/);
		app.connections.setProjectTicketing('PMA', { connectionId: null }, 'test');
		app.connections.delete(connection.id);
		expect(app.connections.list()).toEqual([]);
	});

	it('validates connection and project fields against the provider', () => {
		const { app } = setup();
		expect(() =>
			app.connections.create({ name: 'x', provider: 'plane', settings: { projectId: 'p' } })
		).toThrow(/Unknown connection-level field 'projectId'/);
		expect(() => app.connections.create({ name: 'x', provider: 'plane' })).toThrow(
			/Workspace slug is required/
		);
		const connection = app.connections.create({
			name: 'x',
			provider: 'plane',
			settings: { workspaceSlug: 'acme' }
		});
		expect(() =>
			app.connections.setProjectTicketing('PMA', { connectionId: connection.id }, 'test')
		).toThrow(/Project ID \(UUID\) is required/);
		expect(() =>
			app.connections.setProjectTicketing(
				'PMA',
				{ connectionId: connection.id, target: { projectId: 'p', workspaceSlug: 'x' } },
				'test'
			)
		).toThrow(/Unknown project-level field 'workspaceSlug'/);
		expect(() =>
			app.connections.setProjectTicketing(
				'PMA',
				{
					connectionId: connection.id,
					target: { projectId: 'p' },
					statusMapping: { dev: { id: 5 as unknown as string, name: 'x' } }
				},
				'test'
			)
		).toThrow();
	});

	it('reports a failing check as a result and a working one as ok', async () => {
		const failing = testApp({}, () => new Response('nope', { status: 401 }));
		const connection = failing.app.connections.create({
			name: 'GH',
			provider: 'github',
			settings: {}
		});
		const bad = await failing.app.connections.test(connection.id);
		expect(bad.ok).toBe(false);
		expect(bad.message).toContain('GITHUB_TOKEN');

		const working = testApp({ GITHUB_TOKEN: 't' });
		const gh = working.app.connections.create({ name: 'GH', provider: 'github' });
		expect(await working.app.connections.test(gh.id)).toMatchObject({ ok: true });
		expect(working.calls[0].url).toBe('https://api.github.com/user');
	});

	it('reports provider failures when listing states as a 502', async () => {
		const { app } = testApp({ PLANE_API_KEY: 'k' }, () => new Response('bad key', { status: 401 }));
		app.projects.create({ key: 'PMA', name: 'PM' }, 'test');
		connectProject(app, 'PMA', 'plane', planeSettings);
		await expect(app.connections.listStates('PMA')).rejects.toMatchObject({
			status: 502,
			code: 'provider_error'
		});
	});

	it('never returns the secret from any operation', async () => {
		const { app } = setup();
		const connection = connectProject(app, 'PMA', 'plane', planeSettings, { secret: SECRET });
		const actor = { actor: 'test' };
		const run = async (name: string, input: object) =>
			JSON.stringify(
				await execute(
					app,
					operations.find((o) => o.name === name)!,
					input,
					actor
				)
			);

		const outputs = [
			await run('create_ticketing_connection', {
				name: 'Another',
				provider: 'github',
				secret: SECRET
			}),
			await run('list_ticketing_connections', {}),
			await run('get_ticketing_connection', { connection: connection.id }),
			await run('update_ticketing_connection', { connection: connection.id, secret: SECRET }),
			await run('test_ticketing_connection', { connection: connection.id }),
			await run('list_ticketing_states', { project: 'PMA' }),
			await run('set_project_ticketing', {
				project: 'PMA',
				connectionId: connection.id,
				target: { projectId: 'p' }
			}),
			await run('get_project', { project: 'PMA' }),
			await run('list_projects', {}),
			await run('list_ticket_providers', {})
		];
		for (const output of outputs) expect(output).not.toContain(SECRET);
	});
});

describe('migration to ticketing connections', () => {
	function legacyDb() {
		const db = new DatabaseSync(':memory:');
		db.exec('PRAGMA foreign_keys = ON');
		migrate(db, 1);
		const insert = db.prepare(
			`INSERT INTO projects (id, key, name, ticketing, created_at, updated_at) VALUES (?, ?, ?, ?, 't', 't')`
		);
		const plane = (projectId: string) =>
			JSON.stringify({
				provider: 'plane',
				settings: { workspaceSlug: 'acme', projectId },
				autoSync: false,
				postComments: true
			});
		insert.run('1', 'ONE', 'One', plane('aaaaaaaa-1111-4222-8333-444455556666'));
		insert.run('2', 'TWO', 'Two', plane('bbbbbbbb-1111-4222-8333-444455556666'));
		insert.run(
			'3',
			'THR',
			'Three',
			JSON.stringify({
				provider: 'jira',
				settings: { baseUrl: 'https://acme.atlassian.net', doneStatus: 'Shipped' },
				autoSync: true,
				postComments: false
			})
		);
		insert.run('4', 'FOU', 'Four', null);
		return db;
	}

	it('creates one connection per distinct account and moves project fields to the target', () => {
		const db = legacyDb();
		migrate(db);
		const connections = db.prepare('SELECT * FROM ticketing_connections ORDER BY name').all() as {
			id: string;
			name: string;
			provider: string;
			settings: string;
			secret_ciphertext: string | null;
			headers_ciphertext: string | null;
		}[];
		expect(connections.map((c) => [c.name, c.provider])).toEqual([
			['Jira (acme.atlassian.net)', 'jira'],
			['Plane (acme)', 'plane']
		]);
		expect(connections.every((c) => c.secret_ciphertext === null)).toBe(true);
		expect(connections.every((c) => c.headers_ciphertext === null)).toBe(true);
		const plane = connections.find((c) => c.provider === 'plane')!;
		expect(JSON.parse(plane.settings)).toEqual({ workspaceSlug: 'acme' });

		const projects = db.prepare('SELECT * FROM projects ORDER BY key').all() as Record<
			string,
			unknown
		>[];
		const byKey = Object.fromEntries(projects.map((p) => [p.key as string, p]));
		expect(byKey.ONE.ticketing_connection_id).toBe(plane.id);
		expect(byKey.TWO.ticketing_connection_id).toBe(plane.id);
		expect(JSON.parse(byKey.ONE.ticketing_target as string)).toEqual({
			projectId: 'aaaaaaaa-1111-4222-8333-444455556666'
		});
		expect(JSON.parse(byKey.TWO.ticketing_target as string)).toEqual({
			projectId: 'bbbbbbbb-1111-4222-8333-444455556666'
		});
		expect(byKey.ONE.ticketing_auto_sync).toBe(0);
		expect(JSON.parse(byKey.THR.ticketing_target as string)).toEqual({ doneStatus: 'Shipped' });
		expect(byKey.THR.ticketing_post_comments).toBe(0);
		expect(byKey.FOU.ticketing_connection_id).toBeNull();
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 16 });
	});

	it('keeps migrated projects working: connection resolves and falls back to the environment', async () => {
		const db = legacyDb();
		migrate(db);
		const calls: string[] = [];
		const app = createContainer(db, {
			config: testConfig(),
			env: { PLANE_API_KEY: 'env-key' },
			fetch: (async (url: string) => {
				calls.push(String(url));
				return Response.json({ results: [{ id: 'a', name: 'A', group: 'started' }] });
			}) as unknown as typeof fetch
		});
		const project = app.projects.get('ONE');
		expect(project.ticketing).toMatchObject({
			provider: 'plane',
			target: { projectId: 'aaaaaaaa-1111-4222-8333-444455556666' },
			autoSync: false
		});
		expect(app.connections.list().find((c) => c.provider === 'plane')).toMatchObject({
			secretSource: 'env',
			usedBy: [
				{ key: 'ONE', name: 'One' },
				{ key: 'TWO', name: 'Two' }
			]
		});
		await app.connections.listStates('ONE');
		expect(calls[0]).toBe(
			'https://api.plane.so/api/v1/workspaces/acme/projects/aaaaaaaa-1111-4222-8333-444455556666/states/'
		);
	});
});

describe('custom headers', () => {
	const CF = [
		{ name: 'CF-Access-Client-Id', value: 'abc.access' },
		{ name: 'CF-Access-Client-Secret', value: 'cf-secret-value-xyz' }
	];
	const connect = (
		app: ReturnType<typeof withHeaders>['app'],
		headers: { name: string; value?: string }[] = CF
	) =>
		app.connections.create({
			name: 'Plane',
			provider: 'plane',
			settings: { workspaceSlug: 'acme' },
			secret: SECRET,
			headers
		});
	const withHeaders = () =>
		testApp({ BRIEFLINE_SECRET_KEY: KEY }, () => Response.json({ results: [] }));
	const sent = (init: RequestInit) => Object.fromEntries(new Headers(init.headers));

	it('sends them with every provider request, and the provider headers win', async () => {
		const { app, calls } = withHeaders();
		const connection = connect(app, [...CF, { name: 'X-Trace', value: 't' }]);
		await app.connections.listProjects(connection.id);
		expect(sent(calls[0].init)).toMatchObject({
			'cf-access-client-id': 'abc.access',
			'cf-access-client-secret': 'cf-secret-value-xyz',
			'x-trace': 't',
			'x-api-key': SECRET
		});
	});

	it('sends none without headers and never leaks one connection headers to another', async () => {
		const { app, calls } = withHeaders();
		const withCf = connect(app);
		const plain = app.connections.create({
			name: 'Plain',
			provider: 'plane',
			settings: { workspaceSlug: 'acme' },
			secret: SECRET
		});
		await app.connections.listProjects(plain.id);
		await app.connections.listProjects(withCf.id);
		await app.connections.listProjects(plain.id);
		const [first, second, third] = calls.map((c) => sent(c.init));
		expect(first).not.toHaveProperty('cf-access-client-id');
		expect(second).toHaveProperty('cf-access-client-id');
		expect(third).not.toHaveProperty('cf-access-client-id');
		expect(third).not.toHaveProperty('cf-access-client-secret');
	});

	it('rejects the provider auth header and other invalid headers', () => {
		const { app } = setup();
		expect(() => connect(app, [{ name: 'X-Api-Key', value: 'x' }])).toThrow(/cannot be overridden/);
		expect(() => connect(app, [{ name: 'Bad Name', value: 'x' }])).toThrow(/valid HTTP header/);
		expect(() => connect(app, [{ name: 'X-A' }])).toThrow(/needs a value/);
	});

	it('exposes names only', async () => {
		const { app } = setup();
		const connection = connect(app);
		expect(connection.headers).toEqual([
			{ name: 'CF-Access-Client-Id', hasValue: true },
			{ name: 'CF-Access-Client-Secret', hasValue: true }
		]);
		const actor = { actor: 'test' };
		const run = async (name: string, input: object) =>
			JSON.stringify(
				await execute(
					app,
					operations.find((o) => o.name === name)!,
					input,
					actor
				)
			);
		const outputs = [
			await run('list_ticketing_connections', {}),
			await run('get_ticketing_connection', { connection: connection.id }),
			await run('update_ticketing_connection', { connection: connection.id, headers: CF })
		];
		for (const output of outputs) {
			expect(output).not.toContain('cf-secret-value-xyz');
			expect(output).not.toContain('abc.access');
		}
	});

	it('keeps a stored value when the update omits it, and removes dropped headers', async () => {
		const { app, calls } = withHeaders();
		const { id } = connect(app);
		app.connections.update(id, {
			headers: [{ name: 'cf-access-client-id' }, { name: 'X-New', value: 'n' }]
		});
		expect(app.connections.get(id).headers.map((h) => h.name)).toEqual([
			'cf-access-client-id',
			'X-New'
		]);
		await app.connections.listProjects(id);
		expect(sent(calls[0].init)).toMatchObject({
			'cf-access-client-id': 'abc.access',
			'x-new': 'n'
		});
		expect(sent(calls[0].init)).not.toHaveProperty('cf-access-client-secret');
		expect(() => app.connections.update(id, { headers: [{ name: 'Other' }] })).toThrow(
			/needs a value/
		);
		app.connections.update(id, { name: 'Renamed' });
		expect(app.connections.get(id).headers).toHaveLength(2);
		expect(app.connections.update(id, { headers: [] }).headers).toEqual([]);
	});

	it('needs BRIEFLINE_SECRET_KEY to store headers', () => {
		const { app } = setup({});
		expect(() =>
			app.connections.create({
				name: 'x',
				provider: 'github',
				headers: [{ name: 'X-A', value: 'v' }]
			})
		).toThrow(/BRIEFLINE_SECRET_KEY/);
	});

	it('masks header values in provider errors', async () => {
		const failing = testApp(
			{ BRIEFLINE_SECRET_KEY: KEY },
			() => new Response('denied for cf-secret-value-xyz', { status: 403 })
		);
		const { id } = failing.app.connections.create({
			name: 'Plane',
			provider: 'plane',
			settings: { workspaceSlug: 'acme' },
			secret: SECRET,
			headers: CF
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const result = await failing.app.connections.test(id);
		expect(result.ok).toBe(false);
		expect(result.message).not.toContain('cf-secret-value-xyz');
		expect(result.message).toContain('***');
		expect(warn.mock.calls.flat().join(' ')).not.toContain('cf-secret-value-xyz');
		warn.mockRestore();
	});
});

describe('unreadable stored secrets', () => {
	function withOtherKey(env: Record<string, string | undefined>) {
		const first = setup();
		const connection = first.app.connections.create({
			name: 'GH',
			provider: 'github',
			secret: SECRET,
			headers: [{ name: 'CF-Access-Client-Id', value: 'id' }]
		});
		const db = first.app.db;
		const app = createContainer(db, { config: testConfig(), env });
		return { app, id: connection.id };
	}
	const otherKey = { BRIEFLINE_SECRET_KEY: randomBytes(32).toString('base64') };

	it('flags a key that changed or is missing and still lists the connection', () => {
		for (const env of [otherKey, {}]) {
			const { app, id } = withOtherKey(env);
			expect(app.connections.get(id)).toMatchObject({
				secretUnreadable: true,
				headersUnreadable: true,
				headers: []
			});
		}
		const { app, id } = withOtherKey({ BRIEFLINE_SECRET_KEY: KEY });
		expect(app.connections.get(id)).toMatchObject({
			secretUnreadable: false,
			headersUnreadable: false
		});
	});

	it('replaces unreadable headers when every entry has a value', () => {
		const { app, id } = withOtherKey(otherKey);
		const updated = app.connections.update(id, {
			headers: [{ name: 'CF-Access-Client-Id', value: 'new' }]
		});
		expect(updated).toMatchObject({ headersUnreadable: false, secretUnreadable: true });
		expect(updated.headers.map((h) => h.name)).toEqual(['CF-Access-Client-Id']);
	});

	it('refuses a valueless entry when the saved value cannot be read', () => {
		const { app, id } = withOtherKey(otherKey);
		expect(() =>
			app.connections.update(id, { headers: [{ name: 'CF-Access-Client-Id' }] })
		).toThrow("CF-Access-Client-Id needs a value, the saved one can't be read");
		expect(app.connections.get(id).headersUnreadable).toBe(true);
	});
});
