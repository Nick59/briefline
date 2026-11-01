import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execute } from '../../api/execute.ts';
import { operationsByName } from '../../api/operations.ts';
import { matchRoute } from '../../api/router.ts';
import { runInRequestContext } from '../../core/request-context.ts';
import { handleMcpRequest } from '../../mcp/handler.ts';
import { testApp } from '../../testing/app.ts';

type App = ReturnType<typeof testApp>['app'];

const rpc = (app: App, method: string, params?: object, session?: string | null) =>
	handleMcpRequest(app, { jsonrpc: '2.0', id: 1, method, params }, 'claude', session);

const tool = (app: App, name: string, args: object, session: string | null) =>
	rpc(app, 'tools/call', { name, arguments: args }, session);

const sessionsOf = (app: App, projectKey: string) =>
	app.activity.forProject(projectKey).items.map((a) => a.sessionId);

describe('mcp sessions', () => {
	it('opens a session on initialize and stores the client info', async () => {
		const { app } = testApp();
		const { newSessionId } = await rpc(app, 'initialize', {
			protocolVersion: '2025-06-18',
			clientInfo: { name: 'claude-code', version: '2.1.0' }
		});
		expect(newSessionId).toBeTruthy();
		const session = app.sessions.list({ includeEmpty: true }).items[0];
		expect(session).toMatchObject({
			id: newSessionId,
			actor: 'claude',
			clientName: 'claude-code',
			clientVersion: '2.1.0',
			endedAt: null
		});
	});

	it('does not open a session for other requests', async () => {
		const { app } = testApp();
		const { newSessionId } = await rpc(app, 'tools/list');
		expect(newSessionId).toBeNull();
		expect(app.sessions.list({ includeEmpty: true }).total).toBe(0);
	});

	it('records the session on activity made by a tool call', async () => {
		const { app } = testApp();
		const { newSessionId } = await rpc(app, 'initialize', {});
		await tool(app, 'create_project', { key: 'AI', name: 'Agents' }, newSessionId);
		expect(sessionsOf(app, 'AI')).toEqual([newSessionId]);
		const { items } = app.sessions.list();
		expect(items.map((s) => [s.id, s.activityCount])).toEqual([[newSessionId, 1]]);
		expect(items[0].projects.map((p) => p.key)).toEqual(['AI']);
	});

	it('creates an unknown session lazily without a client name', async () => {
		const { app } = testApp();
		await tool(app, 'create_project', { key: 'LZ', name: 'Lazy' }, 'gone-after-reset');
		expect(sessionsOf(app, 'LZ')).toEqual(['gone-after-reset']);
		const [session] = app.sessions.list().items;
		expect(session).toMatchObject({ id: 'gone-after-reset', actor: 'claude', clientName: null });
	});

	it('ignores a malformed session id', async () => {
		const { app } = testApp();
		await tool(app, 'create_project', { key: 'BD', name: 'Bad' }, 'bad id/../x');
		expect(sessionsOf(app, 'BD')).toEqual([null]);
		expect(app.sessions.list({ includeEmpty: true }).total).toBe(0);
	});

	it('records no session for REST and dashboard calls', async () => {
		const { app } = testApp();
		await execute(
			app,
			operationsByName.get('create_project')!,
			{ key: 'RS', name: 'Rest' },
			{ actor: 'dashboard' }
		);
		expect(sessionsOf(app, 'RS')).toEqual([null]);
		expect(app.sessions.list({ includeEmpty: true }).total).toBe(0);
	});

	it('marks a session ended and keeps the time of the first end', () => {
		const { app } = testApp();
		const id = app.sessions.start('claude');
		app.sessions.end(id);
		const first = app.sessions.list({ includeEmpty: true }).items[0].endedAt;
		expect(first).not.toBeNull();
		app.sessions.end(id);
		expect(app.sessions.list({ includeEmpty: true }).items[0].endedAt).toBe(first);
	});

	it('moves last_seen_at forward on touch', async () => {
		const { app } = testApp();
		const id = app.sessions.start('claude');
		const before = app.sessions.list({ includeEmpty: true }).items[0].lastSeenAt;
		await new Promise((resolve) => setTimeout(resolve, 5));
		app.sessions.touch(id, 'claude');
		expect(app.sessions.list({ includeEmpty: true }).items[0].lastSeenAt > before).toBe(true);
	});
});

describe('session service', () => {
	function work() {
		const { app } = testApp();
		app.projects.create({ key: 'SH', name: 'Shop' }, 'seed');
		const id = app.sessions.start('claude', { name: 'claude-code' });
		const inSession = <T>(run: () => T) => runInRequestContext({ sessionId: id }, run);
		inSession(() => {
			app.epics.create(
				'SH',
				{ title: 'Checkout', tasks: [{ title: 'A' }, { title: 'B' }] },
				'claude'
			);
			app.tasks.create('SH-E1', { title: 'C' }, 'claude');
			app.tasks.setStage('SH-1', { stage: 'dev', status: 'done' }, 'claude');
			app.tasks.setStage('SH-1', { stage: 'deploy', status: 'done' }, 'claude');
			app.specs.createForEpic('SH-E1', { title: 'Plan', content: 'x' }, 'claude');
		});
		return { app, id, inSession };
	}

	it('counts the recap from activity actions', () => {
		const { app, id } = work();
		const [session] = app.sessions.list().items;
		expect(session.id).toBe(id);
		expect(session.recap).toMatchObject({
			stageChanges: 2,
			tasksDone: 1,
			tasksCreated: 1,
			epicsCreated: 1,
			specsAdded: 1,
			specsUpdated: 0,
			threadsOpened: 0
		});
		expect(session.activityCount).toBe(5);
	});

	it('counts opened threads, replies and answers', () => {
		const { app, inSession } = work();
		inSession(() => {
			const [first] = app.questions.add(
				'SH-E1',
				{ questions: [{ question: 'Which?' }, { question: 'Why?' }] },
				'claude'
			);
			app.questions.reply(first.id, { body: 'More' }, 'claude');
			app.questions.answer(first.id, { answer: 'This' }, 'nick');
		});
		expect(app.sessions.list().items[0].recap).toMatchObject({
			threadsOpened: 2,
			replies: 1,
			answers: 1
		});
	});

	it('hides sessions without activity unless asked', () => {
		const { app, id } = work();
		const empty = app.sessions.start('codex');
		expect(app.sessions.list().items.map((s) => s.id)).toEqual([id]);
		expect(
			app.sessions
				.list({ includeEmpty: true })
				.items.map((s) => s.id)
				.sort()
		).toEqual([id, empty].sort());
		expect(app.sessions.list({ actor: 'codex', includeEmpty: true }).total).toBe(1);
		expect(app.sessions.list({ actor: 'codex' }).total).toBe(0);
	});

	it('lists the newest session first and pages', async () => {
		const { app } = work();
		await new Promise((resolve) => setTimeout(resolve, 5));
		const second = app.sessions.start('claude');
		runInRequestContext({ sessionId: second }, () =>
			app.projects.create({ key: 'N2', name: 'Next' }, 'claude')
		);
		const page = app.sessions.list({ limit: 1 });
		expect(page.total).toBe(2);
		expect(page.items.map((s) => s.id)).toEqual([second]);
	});

	it('returns a session with its paginated activity', () => {
		const { app, id } = work();
		const detail = app.sessions.get(id, { limit: 2 });
		expect(detail.session.id).toBe(id);
		expect(detail.activity.total).toBe(5);
		expect(detail.activity.items).toHaveLength(2);
		expect(detail.activity.items.every((a) => a.sessionId === id)).toBe(true);
		expect(() => app.sessions.get('missing')).toThrow(/Session 'missing' was not found/);
	});

	it('sets the summary of the current session when none is named', async () => {
		const { app, id } = work();
		const set = (summary: string) =>
			runInRequestContext({ sessionId: id }, () =>
				execute(
					app,
					operationsByName.get('set_session_summary')!,
					{ summary },
					{ actor: 'claude', transport: 'mcp' }
				)
			);
		await set('Built checkout.');
		expect(app.sessions.get(id).session.summary).toBe('Built checkout.');
		await set('Built checkout and a plan.');
		expect(app.sessions.get(id).session.summary).toBe('Built checkout and a plan.');
		await set('');
		expect(app.sessions.get(id).session.summary).toBeNull();
	});

	it('names a session explicitly and fails clearly without one', async () => {
		const { app, id } = work();
		const set = (input: object) =>
			execute(app, operationsByName.get('set_session_summary')!, input, { actor: 'dashboard' });
		await set({ summary: 'Explicit', session: id });
		expect(app.sessions.get(id).session.summary).toBe('Explicit');
		await expect(set({ summary: 'Nowhere' })).rejects.toMatchObject({
			status: 400,
			body: { error: { message: expect.stringContaining('not part of an agent session') } }
		});
		await expect(set({ summary: 'x', session: 'nope' })).rejects.toMatchObject({ status: 404 });
	});

	it('exposes the operations with sessionId on activity', async () => {
		const { app, id } = work();
		const call = (name: string, input: object = {}) =>
			execute(app, operationsByName.get(name)!, input, { actor: 'dashboard' }) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
		expect(await call('list_sessions')).toMatchObject({ total: 1, limit: 10, hasMore: false });
		const detail = await call('get_session', { session: id, limit: 3 });
		expect(detail.activity).toMatchObject({ total: 5, hasMore: true, nextOffset: 3 });
		expect(detail.activity.items[0].sessionId).toBe(id);
		const all = await call('list_activity');
		expect(all.items.some((a: { sessionId: string | null }) => a.sessionId === null)).toBe(true);
	});
});

describe('get_last_session', () => {
	beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
	afterEach(() => vi.useRealTimers());

	type Last = { session: { id: string } | null; message?: string; activity?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
	const last = (app: App, input: object = {}, sessionId: string | null = null) =>
		runInRequestContext({ sessionId }, () =>
			execute(app, operationsByName.get('get_last_session')!, input, {
				actor: 'dashboard'
			})
		) as Promise<Last>;

	function setup() {
		const { app } = testApp();
		app.projects.create({ key: 'AA', name: 'A' }, 'seed');
		app.projects.create({ key: 'BB', name: 'B' }, 'seed');
		const make = (actor: string, project: string, title: string, count = 1) => {
			const id = app.sessions.start(actor);
			runInRequestContext({ sessionId: id }, () => {
				for (let n = 0; n < count; n++) app.epics.create(project, { title: `${title}${n}` }, actor);
			});
			return id;
		};
		return { app, make };
	}

	it('returns the latest non-empty session, skipping the current and empty ones', async () => {
		const { app, make } = setup();
		const first = make('claude', 'AA', 'one');
		const second = make('claude', 'AA', 'two');
		app.sessions.start('claude');
		vi.setSystemTime(Date.now() + 5000);
		app.sessions.touch(first, 'claude');
		expect((await last(app)).session?.id).toBe(first);
		expect((await last(app, {}, first)).session?.id).toBe(second);
	});

	it('filters by project and actor', async () => {
		const { app, make } = setup();
		const a = make('claude', 'AA', 'a');
		const b = make('codex', 'BB', 'b');
		vi.setSystemTime(Date.now() + 5000);
		app.sessions.touch(b, 'codex');
		expect((await last(app)).session?.id).toBe(b);
		expect((await last(app, { project: 'AA' })).session?.id).toBe(a);
		expect((await last(app, { actor: 'claude' })).session?.id).toBe(a);
		expect((await last(app, { project: 'BB', actor: 'claude' })).session).toBeNull();
		await expect(last(app, { project: 'NOPE' })).rejects.toMatchObject({ status: 404 });
	});

	it('respects activityLimit and reports hasMore', async () => {
		const { app, make } = setup();
		make('claude', 'AA', 't', 5);
		const result = await last(app, { activityLimit: 2 });
		expect(result.activity).toMatchObject({ total: 5, limit: 2, hasMore: true, nextOffset: 2 });
		expect(result.activity.items).toHaveLength(2);
		expect((await last(app)).activity).toMatchObject({ limit: 20, hasMore: false });
	});

	it('returns a null session when there is none', async () => {
		const { app } = setup();
		expect(await last(app)).toEqual({ session: null, message: 'No previous session' });
	});

	it('is reachable over REST and MCP', async () => {
		const { app, make } = setup();
		const id = make('claude', 'AA', 'x');
		const route = matchRoute('GET', '/sessions/last');
		expect(route && 'op' in route && route.op.name).toBe('get_last_session');
		const { body } = await tool(app, 'get_last_session', { project: 'AA' }, 'other');
		expect(JSON.stringify(body)).toContain(id);
	});
});
