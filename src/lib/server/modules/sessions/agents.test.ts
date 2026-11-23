import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESENCE_ONLINE_MS } from '#lib/shared/domain/constants.ts';
import { execute } from '../../api/execute.ts';
import { operationsByName } from '../../api/operations.ts';
import { handleMcpRequest } from '../../mcp/handler.ts';
import { testApp } from '../../testing/app.ts';

type App = ReturnType<typeof testApp>['app'];
type Reply = { result: { content: { text: string }[]; isError?: boolean } };

const rpc = (app: App, actor: string, method: string, params?: object, session?: string | null) =>
	handleMcpRequest(app, { jsonrpc: '2.0', id: 1, method, params }, actor, session);

const open = async (app: App, actor: string) =>
	(await rpc(app, actor, 'initialize', {})).newSessionId!;

const call = async (app: App, actor: string, session: string, name: string, args: object = {}) =>
	(await rpc(app, actor, 'tools/call', { name, arguments: args }, session)).body as Reply;

const register = (app: App, actor: string, session: string, name = 'backend-agent') =>
	call(app, actor, session, 'register_agent', { repo: 'acme/briefline', name });

describe('agent registration', () => {
	it('makes the agent name the actor of every later request in the session', async () => {
		const { app } = testApp();
		const session = await open(app, 'claude');
		const reply = await register(app, 'claude', session);
		expect(JSON.parse(reply.result.content[0].text)).toMatchObject({
			agent: 'briefline:backend-agent',
			repo: 'acme/briefline',
			role: null
		});

		await call(app, 'claude', session, 'create_project', { key: 'AI', name: 'Agents' });
		expect(app.activity.forProject('AI').items[0].actor).toBe('briefline:backend-agent');
		const [stored] = app.sessions.list({ includeEmpty: true }).items;
		expect(stored).toMatchObject({
			actor: 'briefline:backend-agent',
			repo: 'acme/briefline',
			name: 'backend-agent',
			role: null
		});
		expect(app.sessions.last({ actor: 'briefline:backend-agent' })?.session.id).toBe(session);
		const agents = (await execute(
			app,
			operationsByName.get('list_agents')!,
			{},
			{ actor: 'x' }
		)) as {
			actor: string;
			repo?: string;
		}[];
		expect(agents.find((a) => a.actor === 'briefline:backend-agent')?.repo).toBe('acme/briefline');
	});

	it('defaults the name to agent and gives a second online session the next free suffix', async () => {
		const { app } = testApp();
		const first = await open(app, 'claude');
		const second = await open(app, 'codex');
		const third = await open(app, 'gemini');
		const reg = async (actor: string, session: string) =>
			JSON.parse(
				(await call(app, actor, session, 'register_agent', { repo: 'acme/briefline' })).result
					.content[0].text
			);
		expect(await reg('claude', first)).toMatchObject({ agent: 'briefline:agent', name: 'agent' });
		expect(await reg('codex', second)).toMatchObject({
			agent: 'briefline:agent-2',
			name: 'agent-2'
		});
		expect(await reg('gemini', third)).toMatchObject({ agent: 'briefline:agent-3' });
		expect(app.sessions.actorOf(second)).toBe('briefline:agent-2');

		app.sessions.end(first);
		const fourth = await open(app, 'claude');
		expect(await reg('claude', fourth)).toMatchObject({ agent: 'briefline:agent' });
	});

	it('keeps the same default identity in the next session of a repo', async () => {
		const { app } = testApp();
		const first = await open(app, 'claude');
		await call(app, 'claude', first, 'register_agent', { repo: 'acme/briefline' });
		app.sessions.end(first);
		const next = await open(app, 'claude');
		await call(app, 'claude', next, 'register_agent', { repo: 'acme/briefline' });
		expect(app.sessions.actorOf(next)).toBe('briefline:agent');
	});

	it('suffixes an explicit name held by a live session and frees it when that session ends', async () => {
		const { app } = testApp();
		const first = await open(app, 'claude');
		const second = await open(app, 'codex');
		await register(app, 'claude', first);

		expect((await register(app, 'codex', second)).result.isError).toBeUndefined();
		expect(app.sessions.actorOf(second)).toBe('briefline:backend-agent-2');
		expect(app.sessions.actorOf(first)).toBe('briefline:backend-agent');
	});

	describe('claiming a name by presence', () => {
		afterEach(() => vi.useRealTimers());

		it('suffixes while the holder is online, claims the name once it is past the online window, and ends it', async () => {
			vi.useFakeTimers({ toFake: ['Date'] });
			const { app } = testApp();
			const first = await open(app, 'claude');
			const second = await open(app, 'codex');
			await register(app, 'claude', first);

			vi.setSystemTime(Date.now() + PRESENCE_ONLINE_MS - 1000);
			await register(app, 'codex', second);
			expect(app.sessions.actorOf(second)).toBe('briefline:backend-agent-2');
			expect(app.sessions.get(first).session.endedAt).toBeNull();

			vi.setSystemTime(Date.now() + 2000);
			expect((await register(app, 'codex', second)).result.isError).toBeUndefined();
			expect(app.sessions.get(first).session.endedAt).not.toBeNull();
			expect(app.sessions.actorOf(first)).toBeNull();
			expect(app.sessions.actorOf(second)).toBe('briefline:backend-agent');
		});
	});

	it('rejects a name equal to a person and a call without an MCP session', async () => {
		const { app } = testApp();
		app.profile.update({ name: 'proj:me', role: 'developer', codingLevel: 'expert' });
		const session = await open(app, 'claude');
		const reply = await call(app, 'claude', session, 'register_agent', {
			repo: 'proj',
			name: 'me'
		});
		expect(reply.result.isError).toBe(true);

		await expect(
			execute(
				app,
				operationsByName.get('register_agent')!,
				{ repo: 'a/b', name: 'x' },
				{ actor: 'claude' }
			)
		).rejects.toMatchObject({ status: 400 });
		expect(
			(await call(app, 'claude', session, 'register_agent', { repo: 'a b', name: 'x' })).result
				.isError
		).toBe(true);
	});

	it('gives an unregistered second session a distinct actor', async () => {
		const { app } = testApp();
		const first = await open(app, 'claude');
		const second = await open(app, 'claude');
		const third = await open(app, 'claude');
		expect([first, second, third].map((id) => app.sessions.actorOf(id))).toEqual([
			'claude',
			'claude-2',
			'claude-3'
		]);
		await call(app, 'claude', second, 'create_project', { key: 'AI', name: 'Agents' });
		expect(app.activity.forProject('AI').items[0].actor).toBe('claude-2');
	});
});

describe('header registration', () => {
	const registered = (app: App) => app.sessions.registrations();

	it('registers a session from its repo:name header', async () => {
		const { app } = testApp();
		const id = await open(app, 'briefline:agent');
		expect(app.sessions.actorOf(id)).toBe('briefline:agent');
		expect(registered(app).get('briefline:agent')).toMatchObject({
			repo: 'briefline',
			name: 'agent'
		});
	});

	it('suffixes a second live session with the same header', async () => {
		const { app } = testApp();
		const first = await open(app, 'briefline:agent');
		const second = await open(app, 'briefline:agent');
		expect([first, second].map((id) => app.sessions.actorOf(id))).toEqual([
			'briefline:agent',
			'briefline:agent-2'
		]);
		expect(registered(app).get('briefline:agent-2')).toMatchObject({ name: 'agent-2' });
	});

	it('leaves anonymous and person headers unregistered', async () => {
		const { app } = testApp();
		app.profile.update({ name: 'proj:me', role: 'developer', codingLevel: 'expert' });
		const mcp = await open(app, 'mcp');
		const me = await open(app, 'proj:me');
		expect([mcp, me].map((id) => app.sessions.actorOf(id))).toEqual(['mcp', 'proj:me']);
		expect(registered(app).size).toBe(0);
	});

	it('keeps the header name on register without a name, and an explicit name overrides', async () => {
		const { app } = testApp();
		const id = await open(app, 'briefline:backend');
		const kept = await call(app, 'briefline:backend', id, 'register_agent', {
			repo: 'acme/briefline'
		});
		expect(JSON.parse(kept.result.content[0].text).agent).toBe('briefline:backend');
		const renamed = await register(app, 'briefline:backend', id, 'other');
		expect(JSON.parse(renamed.result.content[0].text).agent).toBe('briefline:other');
	});

	it('registers an unknown session id on touch', () => {
		const { app } = testApp();
		app.sessions.touch('unknown-id', 'briefline:agent');
		expect(app.sessions.actorOf('unknown-id')).toBe('briefline:agent');
		expect(app.sessions.registrations().has('briefline:agent')).toBe(true);
	});
});

describe('soft claim', () => {
	it('assigns the first agent and reports the holder to the second', async () => {
		const { app } = testApp();
		const a = await open(app, 'claude');
		const b = await open(app, 'codex');
		await register(app, 'claude', a, 'one');
		await register(app, 'codex', b, 'two');
		await call(app, 'claude', a, 'create_project', { key: 'AI', name: 'Agents' });
		const epic = app.epics.create('AI', { title: 'E' }, 'seed');
		const task = app.tasks.create(epic.key, { title: 'T' }, 'seed');
		const start = { task: task.key, stage: 'dev', status: 'in_progress' };

		const first = JSON.parse(
			(await call(app, 'claude', a, 'set_task_stage_status', start)).result.content[0].text
		);
		expect(first.assignee).toBe('briefline:one');
		expect(first.claimedBy).toBeUndefined();

		const second = JSON.parse(
			(await call(app, 'codex', b, 'set_task_stage_status', start)).result.content[0].text
		);
		expect(second).toMatchObject({ assignee: 'briefline:one', claimedBy: 'briefline:one' });
		expect(app.tasks.get(task.key).assignee).toBe('briefline:one');
	});

	it('leaves a task alone when a person starts it', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'AI', name: 'Agents' }, 'seed');
		const epic = app.epics.create('AI', { title: 'E' }, 'seed');
		const task = app.tasks.create(epic.key, { title: 'T' }, 'seed');
		await execute(
			app,
			operationsByName.get('set_task_stage_status')!,
			{ task: task.key, stage: 'dev', status: 'in_progress' },
			{ actor: 'dashboard' }
		);
		expect(app.tasks.get(task.key).assignee).toBeNull();
	});
});

describe('meanwhile', () => {
	it('shows what others did once, and never your own changes', async () => {
		const { app } = testApp();
		const a = await open(app, 'claude');
		const b = await open(app, 'codex');
		expect((await call(app, 'claude', a, 'list_projects')).result.content).toHaveLength(1);
		await call(app, 'codex', b, 'list_projects');

		await call(app, 'codex', b, 'create_project', { key: 'AI', name: 'Agents' });
		const seen = await call(app, 'claude', a, 'list_projects');
		expect(seen.result.content).toHaveLength(2);
		const { meanwhile } = JSON.parse(seen.result.content[1].text);
		expect(meanwhile.andMore).toBe(0);
		expect(meanwhile.items).toEqual([
			expect.objectContaining({ actor: 'codex', message: 'Created project Agents' })
		]);

		expect((await call(app, 'claude', a, 'list_projects')).result.content).toHaveLength(1);
		expect((await call(app, 'codex', b, 'list_projects')).result.content).toHaveLength(1);
	});

	it('lists at most 20 entries, oldest first, and counts the rest', async () => {
		const { app } = testApp();
		const a = await open(app, 'claude');
		await call(app, 'claude', a, 'list_projects');
		app.projects.create({ key: 'AI', name: 'Agents' }, 'seed');
		const epic = app.epics.create('AI', { title: 'E' }, 'seed');
		for (let i = 0; i < 24; i++) app.tasks.create(epic.key, { title: `T${i}` }, 'seed');

		const reply = await call(app, 'claude', a, 'list_projects');
		const { meanwhile } = JSON.parse(reply.result.content[1].text);
		expect(meanwhile.items).toHaveLength(20);
		expect(meanwhile.items[0].message).toContain('Created project');
		expect(meanwhile.andMore).toBe(6);
	});
});
