import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectProject, testApp, type FetchCall } from '../../testing/app.ts';

interface Remote {
	title: string;
	body: string | null;
	state: 'open' | 'closed';
	comments: { id: number; body: string; user: { login: string }; created_at: string }[];
	fail?: boolean;
}

const remote = (patch: Partial<Remote> = {}): Remote => ({
	title: 'Task',
	body: null,
	state: 'open',
	comments: [],
	...patch
});

afterEach(() => vi.useRealTimers());

function setup(remotes: Record<string, Remote> = { '7': remote() }, clock?: () => number) {
	const respond = (call: FetchCall) => {
		const match = call.url.match(/\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)(\/comments)?/);
		if (!match || (call.init.method ?? 'GET') !== 'GET') return Response.json({ id: 42 });
		const item = remotes[match[2]];
		if (!item || item.fail || match[1] === 'acme/bad') return new Response('boom', { status: 500 });
		return match[3] ? Response.json(item.comments) : Response.json(item);
	};
	const { app, calls } = testApp({ GITHUB_TOKEN: 'secret' }, respond, {}, clock);
	app.projects.create({ key: 'SHOP', name: 'Shop' }, 'test');
	const connection = connectProject(app, 'SHOP', 'github', { repo: 'acme/shop' });
	app.connections.setProjectTicketing(
		'SHOP',
		{ connectionId: connection.id, autoPull: true, pullMinutes: 5 },
		'test'
	);
	const epic = app.epics.create(
		'SHOP',
		{ title: 'Epic', tasks: [{ title: 'Task', externalRef: { provider: 'github', key: '#7' } }] },
		'test'
	);
	return { app, calls, epic, remotes };
}

const pushes = (calls: FetchCall[]) => calls.filter((c) => (c.init.method ?? 'GET') !== 'GET');

describe('ticket pull', () => {
	it('writes changed title, description and closed state with actor ticket-sync and pushes nothing back', async () => {
		const { app, calls } = setup({
			'7': remote({ title: 'Renamed', body: 'New body', state: 'closed' })
		});
		await app.ticketPull.pullProject('SHOP');
		await app.ticketing.idle();
		expect(app.tasks.get('SHOP-1')).toMatchObject({
			title: 'Renamed',
			description: 'New body',
			stages: { dev: 'done', test: 'done', deploy: 'done' }
		});
		const items = app.activity.forTask('SHOP-1').items;
		expect(items.some((a) => a.actor === 'ticket-sync')).toBe(true);
		expect(pushes(calls)).toEqual([]);
	});

	it('writes nothing when the ticket matches', async () => {
		const { app } = setup();
		const before = app.tasks.get('SHOP-1').updatedAt;
		const count = app.activity.forTask('SHOP-1').items.length;
		await app.ticketPull.pullProject('SHOP');
		expect(app.tasks.get('SHOP-1').updatedAt).toBe(before);
		expect(app.activity.forTask('SHOP-1').items).toHaveLength(count);
	});

	it('imports a new comment once', async () => {
		const { app, remotes } = setup();
		remotes['7'].comments = [
			{ id: 1, body: 'Looks good', user: { login: 'bob' }, created_at: '2026-01-01T00:00:00Z' }
		];
		await app.ticketPull.pullProject('SHOP');
		await app.ticketPull.pullProject('SHOP');
		const comments = app.comments.list('SHOP-1');
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({
			author: 'ticket-sync',
			body: 'Looks good\n\n_Comment by bob in GitHub Issues._'
		});
	});

	it('imports comments oldest first', async () => {
		const { app, remotes } = setup();
		remotes['7'].comments = [
			{ id: 2, body: 'second', user: { login: 'a' }, created_at: '2026-01-02T00:00:00Z' },
			{ id: 1, body: 'first', user: { login: 'a' }, created_at: '2026-01-01T00:00:00Z' }
		];
		await app.ticketPull.pullProject('SHOP');
		expect(app.comments.list('SHOP-1').map((c) => c.body.split('\n')[0])).toEqual([
			'first',
			'second'
		]);
	});

	it('skips comments already mapped, pushed from Briefline, or the description header', async () => {
		const { app, remotes } = setup();
		const connection = app.connections.list()[0];
		app.db
			.prepare(
				'INSERT INTO ticket_comments (comment_id, connection_id, ticket_key, remote_id) VALUES (?, ?, ?, ?)'
			)
			.run('local', connection.id, '#7', '1');
		const at = '2026-01-01T00:00:00Z';
		remotes['7'].comments = [
			{ id: 1, body: 'known', user: { login: 'a' }, created_at: at },
			{
				id: 2,
				body: 'x\n\n_Comment by claude from Briefline._',
				user: { login: 'a' },
				created_at: at
			},
			{
				id: 3,
				body: '**SHOP-1** Task: Dev → In progress\n\n_Updated by claude from the AI project dashboard._',
				user: { login: 'a' },
				created_at: at
			},
			{
				id: 4,
				body: '**Briefline task description (SHOP-1)**\n\nText',
				user: { login: 'a' },
				created_at: at
			}
		];
		await app.ticketPull.pullProject('SHOP');
		expect(app.comments.list('SHOP-1')).toEqual([]);
	});

	it('keeps the description when the remote one is empty', async () => {
		const { app } = setup();
		app.tasks.update('SHOP-1', { description: 'Mine' }, 'test');
		await app.ticketPull.pullProject('SHOP');
		expect(app.tasks.get('SHOP-1').description).toBe('Mine');
	});

	it('gives a cancelled task no stage change', async () => {
		const { app, remotes } = setup();
		app.tasks.cancel('SHOP-1', { reason: 'no' }, 'test');
		remotes['7'].state = 'closed';
		await app.ticketPull.pullProject('SHOP');
		expect(app.tasks.get('SHOP-1').stages).toEqual({ dev: 'todo', test: 'todo', deploy: 'todo' });
	});

	it('bypasses open questions and unapproved specs when the ticket moved', async () => {
		const { app, epic, remotes } = setup();
		app.questions.add(epic.id, { questions: [{ question: 'Which?' }] }, 'claude');
		app.specs.createForEpic(epic.id, { title: 'Plan' }, 'claude');
		expect(() =>
			app.tasks.setStage('SHOP-1', { stage: 'dev', status: 'in_progress' }, 'claude')
		).toThrow();
		remotes['7'].state = 'closed';
		await app.ticketPull.pullProject('SHOP');
		expect(app.tasks.get('SHOP-1').stages.dev).toBe('done');
		expect(app.ticketing.jobs({ status: 'failed' })).toEqual([]);
	});

	it('leaves items without their own ticket untouched and never fetches them', async () => {
		const { app, calls, epic } = setup({
			'7': remote(),
			'9': remote({ state: 'closed' })
		});
		app.epics.update(epic.id, { externalRef: { provider: 'github', key: '#9' } }, 'test');
		app.tasks.update('SHOP-1', { externalRef: null }, 'test');
		app.tasks.create(epic.id, { title: 'Empty key' }, 'test');
		app.db
			.prepare("UPDATE tasks SET external_ref = ? WHERE key = 'SHOP-2'")
			.run('{"provider":"github","key":"","url":null}');
		await app.ticketing.idle();
		calls.length = 0;
		await app.ticketPull.pullProject('SHOP');
		expect(calls.map((c) => c.url)).toEqual([
			'https://api.github.com/repos/acme/shop/issues/9',
			'https://api.github.com/repos/acme/shop/issues/9/comments?per_page=100'
		]);
		expect(app.tasks.get('SHOP-1').stages).toEqual({ dev: 'todo', test: 'todo', deploy: 'todo' });
		expect(app.tasks.get('SHOP-2').stages).toEqual({ dev: 'todo', test: 'todo', deploy: 'todo' });
	});

	it('pulls the epic title and description into the summary', async () => {
		const { app, epic } = setup({ '7': remote(), '9': remote({ title: 'Big', body: 'Plan' }) });
		app.epics.update(epic.id, { externalRef: { provider: 'github', key: '#9' } }, 'test');
		await app.ticketPull.pullProject('SHOP');
		expect(app.epics.get(epic.id)).toMatchObject({ title: 'Big', summary: 'Plan' });
	});

	it('does not fetch when autoPull is off', async () => {
		const { app, calls } = setup();
		const connectionId = app.projects.get('SHOP').ticketing.connectionId!;
		app.connections.setProjectTicketing('SHOP', { connectionId, autoPull: false }, 'test');
		await app.ticketPull.pullProject('SHOP');
		expect(calls).toEqual([]);
	});

	it('does not fetch for a provider without fetchTicket', async () => {
		const { app, calls } = testApp();
		app.projects.create({ key: 'HOOK', name: 'Hook' }, 'test');
		const connection = connectProject(app, 'HOOK', 'webhook', { url: 'https://example.com/hook' });
		app.connections.setProjectTicketing(
			'HOOK',
			{ connectionId: connection.id, autoPull: true },
			'test'
		);
		app.epics.create(
			'HOOK',
			{ title: 'E', tasks: [{ title: 'T', externalRef: { provider: 'webhook', key: 'X-1' } }] },
			'test'
		);
		await app.ticketing.idle();
		calls.length = 0;
		await app.ticketPull.pullProject('HOOK');
		expect(calls).toEqual([]);
	});

	it('records a failed pull job and raises one event across repeated identical failures', async () => {
		const { app, remotes } = setup();
		remotes['7'].fail = true;
		await app.ticketPull.pullProject('SHOP');
		await app.ticketPull.pullProject('SHOP');
		const jobs = app.ticketing.jobs({ status: 'failed' });
		expect(jobs).toHaveLength(2);
		expect(jobs[0]).toMatchObject({ operation: 'pull_ticket', provider: 'github' });
		const events = app.activity
			.forTask('SHOP-1')
			.items.filter((a) => a.action === 'ticket.sync_failed');
		expect(events).toHaveLength(1);
	});

	it('lets another project update when one fails', async () => {
		const { app } = setup({ '7': remote({ title: 'Updated' }) });
		app.projects.create({ key: 'BAD', name: 'Bad' }, 'test');
		const connection = connectProject(app, 'BAD', 'github', { repo: 'acme/bad' });
		app.connections.setProjectTicketing(
			'BAD',
			{ connectionId: connection.id, autoPull: true },
			'test'
		);
		app.epics.create(
			'BAD',
			{ title: 'E', tasks: [{ title: 'T', externalRef: { provider: 'github', key: '#7' } }] },
			'test'
		);
		await app.ticketing.idle();
		await app.ticketPull.tick();
		expect(app.tasks.get('SHOP-1').title).toBe('Updated');
		expect(
			app.ticketing.jobs({ projectId: app.projects.get('BAD').id, status: 'failed' })
		).toHaveLength(1);
	});

	it('ignores a concurrent pull of the same project', async () => {
		const { app, calls } = setup();
		await Promise.all([app.ticketPull.pullProject('SHOP'), app.ticketPull.pullProject('SHOP')]);
		expect(calls).toHaveLength(2);
	});

	it('runs a project only when its interval has passed', async () => {
		let time = 0;
		const { app, calls } = setup(undefined, () => time);
		await app.ticketPull.tick();
		expect(calls).toHaveLength(2);
		time = 4 * 60_000;
		await app.ticketPull.tick();
		expect(calls).toHaveLength(2);
		time = 5 * 60_000;
		await app.ticketPull.tick();
		expect(calls).toHaveLength(4);

		const connectionId = app.projects.get('SHOP').ticketing.connectionId!;
		app.connections.setProjectTicketing('SHOP', { connectionId, pullMinutes: 10 }, 'test');
		time = 14 * 60_000;
		await app.ticketPull.tick();
		expect(calls).toHaveLength(4);
		time = 15 * 60_000;
		await app.ticketPull.tick();
		expect(calls).toHaveLength(6);
	});

	it('ticks every minute after start and stops after stop', async () => {
		vi.useFakeTimers();
		let time = 0;
		const { app, calls } = setup(undefined, () => time);
		app.ticketPull.start();
		time = 60_000;
		await vi.advanceTimersByTimeAsync(60_000);
		expect(calls).toHaveLength(2);
		app.ticketPull.stop();
		time = 10 * 60_000;
		await vi.advanceTimersByTimeAsync(10 * 60_000);
		expect(calls).toHaveLength(2);
	});

	it('refuses to retry a pull job', async () => {
		const { app, remotes } = setup();
		remotes['7'].fail = true;
		await app.ticketPull.pullProject('SHOP');
		const [job] = app.ticketing.jobs({ status: 'failed' });
		await expect(app.ticketing.retry(job.id)).rejects.toThrow(
			'Pull failures retry on the next pull'
		);
	});

	describe('status', () => {
		it('is empty before any pull', () => {
			const { app } = setup();
			expect(app.ticketPull.status('SHOP')).toEqual({
				running: false,
				lastPulledAt: null,
				updated: 0,
				error: null
			});
		});

		it('is running during a pull and settled after, and publishes both to subscribers', async () => {
			const { app } = setup(undefined, () => Date.parse('2026-11-04T10:00:00Z'));
			const seen: boolean[] = [];
			app.ticketPull.subscribe((_id, status) => seen.push(status.running));
			const pulling = app.ticketPull.pullProject('SHOP');
			expect(app.ticketPull.status('SHOP').running).toBe(true);
			await pulling;
			expect(seen).toEqual([true, false]);
			expect(app.ticketPull.status('SHOP')).toEqual({
				running: false,
				lastPulledAt: '2026-11-04T10:00:00.000Z',
				updated: 0,
				error: null
			});
		});

		it('counts changed tasks, changed epics and imported comments', async () => {
			const { app, epic, remotes } = setup({
				'7': remote({ title: 'Renamed' }),
				'9': remote({ title: 'Big' })
			});
			remotes['7'].comments = [
				{ id: 1, body: 'a', user: { login: 'x' }, created_at: '2026-01-01T00:00:00Z' },
				{ id: 2, body: 'b', user: { login: 'x' }, created_at: '2026-01-02T00:00:00Z' }
			];
			app.epics.update(epic.id, { externalRef: { provider: 'github', key: '#9' } }, 'test');
			await app.ticketPull.pullProject('SHOP');
			expect(app.ticketPull.status('SHOP')).toMatchObject({ updated: 4, error: null });
			await app.ticketPull.pullProject('SHOP');
			expect(app.ticketPull.status('SHOP')).toMatchObject({ updated: 0, error: null });
		});

		it('reports failed tickets with the first message', async () => {
			const { app, remotes } = setup();
			remotes['7'].fail = true;
			await app.ticketPull.pullProject('SHOP');
			const { error, lastPulledAt, running } = app.ticketPull.status('SHOP');
			expect(error).toMatch(/^1 ticket failed: /);
			expect(lastPulledAt).not.toBeNull();
			expect(running).toBe(false);
		});

		it('reports a project-level failure', async () => {
			const { app } = setup();
			vi.spyOn(app.connections, 'forProject').mockImplementation(() => {
				throw new Error('no secret');
			});
			await app.ticketPull.pullProject('SHOP');
			expect(app.ticketPull.status('SHOP').error).toBe('no secret');
		});
	});

	describe('pull now', () => {
		it('works with autoPull off and starts no second pull while one runs', async () => {
			const { app, calls } = setup();
			const connectionId = app.projects.get('SHOP').ticketing.connectionId!;
			app.connections.setProjectTicketing('SHOP', { connectionId, autoPull: false }, 'test');
			expect(app.ticketPull.pullNow('SHOP').running).toBe(true);
			expect(app.ticketPull.pullNow('SHOP').running).toBe(true);
			await app.ticketPull.idle();
			expect(calls).toHaveLength(2);
			expect(app.ticketPull.status('SHOP')).toMatchObject({ running: false, error: null });
			expect(app.ticketPull.status('SHOP').lastPulledAt).not.toBeNull();
		});

		it('is rejected for a project without a pull-capable connection', () => {
			const { app } = testApp();
			app.projects.create({ key: 'NONE', name: 'None' }, 'test');
			app.projects.create({ key: 'HOOK', name: 'Hook' }, 'test');
			const connection = connectProject(app, 'HOOK', 'webhook', { url: 'https://example.com/h' });
			app.connections.setProjectTicketing('HOOK', { connectionId: connection.id }, 'test');
			expect(app.ticketPull.canPull('NONE')).toBe(false);
			expect(app.ticketPull.canPull('HOOK')).toBe(false);
			expect(() => app.ticketPull.pullNow('NONE')).toThrow(/supports pulling/);
			expect(() => app.ticketPull.pullNow('HOOK')).toThrow(/supports pulling/);
		});
	});
});
