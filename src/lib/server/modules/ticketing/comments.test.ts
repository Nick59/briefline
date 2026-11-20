import { jiraProvider } from './providers/jira.ts';
import { planeProvider } from './providers/plane.ts';
import { linearProvider } from './providers/linear.ts';
import { webhookProvider } from './providers/webhook.ts';
import type { TicketContext } from './provider.ts';
import { describe, expect, it } from 'vitest';
import { hashDescription } from './description-hash.ts';
import { connectProject, testApp, type FetchCall } from '../../testing/app.ts';

function setup(respond: (call: FetchCall) => Response = () => Response.json({ id: 42 })) {
	const { app, calls } = testApp({ GITHUB_TOKEN: 'secret' }, respond);
	app.projects.create({ key: 'SHOP', name: 'Shop' }, 'test');
	connectProject(app, 'SHOP', 'github', { repo: 'acme/shop' });
	app.epics.create(
		'SHOP',
		{ title: 'Epic', tasks: [{ title: 'Task', externalRef: { provider: 'github', key: '#7' } }] },
		'test'
	);
	return { app, calls };
}

describe('task comment sync', () => {
	it('posts the full body, updates the same comment, and deletes it without changing ticket content or status', async () => {
		const { app, calls } = setup();
		const body = 'Long comment '.repeat(100);
		const comment = app.comments.add('SHOP-1', { body }, 'claude');
		await app.ticketing.idle();
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('https://api.github.com/repos/acme/shop/issues/7/comments');
		expect(JSON.parse(String(calls[0].init.body)).body).toBe(
			`${body.trim()}\n\n_Comment by claude from Briefline._`
		);
		app.comments.update(comment.id, { body: 'Edited' }, 'claude');
		await app.ticketing.idle();
		expect(calls[1]).toMatchObject({
			url: 'https://api.github.com/repos/acme/shop/issues/comments/42',
			init: { method: 'PATCH' }
		});
		app.comments.delete(comment.id, 'claude');
		await app.ticketing.idle();
		expect(calls[2]).toMatchObject({
			url: 'https://api.github.com/repos/acme/shop/issues/comments/42',
			init: { method: 'DELETE' }
		});
		expect(calls).toHaveLength(3);
		expect(app.db.prepare('SELECT * FROM ticket_comments').all()).toEqual([]);
		expect(
			app.ticketing
				.jobs({})
				.filter((j) => j.operation === 'sync_comment')
				.every((j) => j.status === 'succeeded')
		).toBe(true);
	});

	it('respects autoSync being disabled', async () => {
		const { app, calls } = setup();
		app.connections.setProjectTicketing(
			'SHOP',
			{ connectionId: app.projects.get('SHOP').ticketing.connectionId, autoSync: false },
			'test'
		);
		app.comments.add('SHOP-1', { body: 'Private' }, 'claude');
		await app.ticketing.idle();
		expect(calls).toEqual([]);
		expect(app.ticketing.jobs({})).toEqual([]);
	});

	it('retries using the latest text and never recreates a deleted comment', async () => {
		let failing = true;
		const { app, calls } = setup(() =>
			failing ? new Response('unavailable', { status: 503 }) : Response.json({ id: 42 })
		);
		const comment = app.comments.add('SHOP-1', { body: 'Original' }, 'claude');
		await app.ticketing.idle();
		const failed = app.ticketing.jobs({ status: 'failed' })[0];
		app.comments.update(comment.id, { body: 'Latest' }, 'claude');
		await app.ticketing.idle();
		failing = false;
		await app.ticketing.retry(failed.id);
		expect(JSON.parse(String(calls.at(-1)!.init.body)).body).toContain('Latest');
		app.comments.delete(comment.id, 'claude');
		await app.ticketing.idle();
		const count = calls.length;
		await app.ticketing.retry(app.ticketing.jobs({ status: 'failed' })[0].id);
		expect(calls).toHaveLength(count);
	});

	it('serializes rapid edits after creation and retries successful jobs without duplicates', async () => {
		const { app, calls } = setup();
		const comment = app.comments.add('SHOP-1', { body: 'First' }, 'claude');
		app.comments.update(comment.id, { body: 'Second' }, 'claude');
		app.comments.update(comment.id, { body: 'Last' }, 'claude');
		await app.ticketing.idle();
		expect(calls.map((c) => c.init.method)).toEqual(['POST', 'PATCH', 'PATCH']);
		expect(JSON.parse(String(calls.at(-1)!.init.body)).body).toContain('Last');
		await app.ticketing.retry(app.ticketing.jobs({})[0].id);
		expect(calls).toHaveLength(3);
	});

	it('counts concurrent failed retries in order', async () => {
		const { app, calls } = setup(() => new Response('unavailable', { status: 503 }));
		app.comments.add('SHOP-1', { body: 'Retry me' }, 'claude');
		await app.ticketing.idle();
		const failed = app.ticketing.jobs({ status: 'failed' })[0];
		await Promise.all([app.ticketing.retry(failed.id), app.ticketing.retry(failed.id)]);
		expect(calls).toHaveLength(3);
		expect(app.ticketing.jobs({ status: 'failed' })[0].attempts).toBe(3);
	});

	const writes = (calls: FetchCall[]) => calls.filter((call) => call.init.method !== 'GET');
	const bodies = (calls: FetchCall[]) => writes(calls).map((c) => JSON.parse(String(c.init.body)));

	it('pushes the full task description into the ticket body, not as a comment', async () => {
		const { app, calls } = setup();
		const body = 'Technical details\n'.repeat(100);
		app.tasks.update('SHOP-1', { description: body }, 'test');
		await app.ticketing.idle();
		expect(writes(calls)).toHaveLength(1);
		expect(writes(calls)[0]).toMatchObject({
			url: 'https://api.github.com/repos/acme/shop/issues/7',
			init: { method: 'PATCH' }
		});
		expect(bodies(calls)[0]).toEqual({ body: body.trim() });
		app.tasks.update('SHOP-1', { description: '' }, 'test');
		await app.ticketing.idle();
		expect(bodies(calls)[1]).toEqual({ body: '' });
		expect(calls.some((call) => call.url.includes('/comments') && call.init.method !== 'GET')).toBe(
			false
		);
		expect(app.ticketing.jobs({}).map((j) => j.operation)).toEqual([
			'push_description',
			'push_description'
		]);
	});

	it('records the description the ticket returns after a push', async () => {
		const { app } = setup((call) =>
			call.init.method === 'GET' && call.url.endsWith('/issues/7')
				? Response.json({ title: 'Task', body: 'stored remotely', state: 'open' })
				: call.init.method === 'GET'
					? Response.json([])
					: Response.json({ id: 42 })
		);
		app.tasks.update('SHOP-1', { description: '# Mine' }, 'test');
		await app.ticketing.idle();
		const row = app.db.prepare('SELECT hash FROM ticket_description_hashes').get() as {
			hash: string;
		};
		expect(row.hash).toBe(hashDescription('stored remotely'));
	});

	it('does not publish descriptions when autoSync is disabled', async () => {
		const { app, calls } = setup();
		app.connections.setProjectTicketing(
			'SHOP',
			{ connectionId: app.projects.get('SHOP').ticketing.connectionId, autoSync: false },
			'test'
		);
		app.tasks.update('SHOP-1', { description: 'Private' }, 'test');
		await app.ticketing.idle();
		expect(calls).toEqual([]);
	});

	it('syncs existing descriptions on first linking and ignores retries after relinking', async () => {
		let failing = true;
		const { app, calls } = setup(() =>
			failing ? new Response('error', { status: 503 }) : Response.json({ id: 42 })
		);
		app.tasks.update('SHOP-1', { externalRef: null, description: 'Existing' }, 'test');
		app.tasks.update('SHOP-1', { externalRef: { provider: 'github', key: '#8' } }, 'test');
		await app.ticketing.idle();
		const failed = app.ticketing.jobs({ status: 'failed' })[0];
		failing = false;
		app.tasks.update(
			'SHOP-1',
			{ description: 'Latest', externalRef: { provider: 'github', key: '#9' } },
			'test'
		);
		await app.ticketing.idle();
		const count = calls.length;
		await app.ticketing.retry(failed.id);
		expect(calls).toHaveLength(count);
		expect(bodies(calls).at(-1)).toEqual({ body: 'Latest' });
	});

	const remoteIssue = (body: string | null) => (call: FetchCall) =>
		call.init.method !== 'GET'
			? Response.json({ id: 42 })
			: call.url.includes('/comments')
				? Response.json([])
				: Response.json({ title: 'Task', body, state: 'open' });

	const nested = (key: string, description: string) => ({
		title: 'Second',
		tasks: [{ title: 'Nested', description, externalRef: { provider: 'github', key } }]
	});

	it('pushes the Briefline description of a task created with an epic when the ticket has none', async () => {
		const { app, calls } = setup(remoteIssue(null));
		app.epics.create('SHOP', nested('#11', 'Initial details'), 'test');
		await app.ticketing.idle();
		expect(writes(calls)).toHaveLength(1);
		expect(writes(calls)[0].url).toBe('https://api.github.com/repos/acme/shop/issues/11');
		expect(bodies(calls)[0]).toEqual({ body: 'Initial details' });
	});

	it('replaces the Briefline description with the ticket description on link, without pushing', async () => {
		const { app, calls } = setup(remoteIssue('From the ticket'));
		app.epics.create('SHOP', nested('#11', 'Initial details'), 'test');
		await app.ticketing.idle();
		expect(app.tasks.get('SHOP-2').description).toBe('From the ticket');
		expect(writes(calls)).toEqual([]);
		expect(app.ticketing.jobs({}).map((j) => j.operation)).toEqual(['pull_description']);
		expect(app.db.prepare('SELECT hash FROM ticket_description_hashes').all()).toEqual([
			{ hash: hashDescription('From the ticket') }
		]);
	});

	it('adopts the ticket description when an existing task is linked or relinked', async () => {
		const { app, calls } = setup(remoteIssue('Remote text'));
		app.tasks.update('SHOP-1', { description: 'Mine' }, 'test');
		await app.ticketing.idle();
		app.tasks.update('SHOP-1', { externalRef: { provider: 'github', key: '#8' } }, 'test');
		await app.ticketing.idle();
		expect(app.tasks.get('SHOP-1').description).toBe('Remote text');
		expect(writes(calls)).toHaveLength(1);
		expect(app.ticketing.jobs({}).every((j) => j.status === 'succeeded')).toBe(true);
	});

	it('does nothing on link when the provider cannot read tickets', async () => {
		const { app, calls } = testApp({}, () => Response.json({}));
		app.projects.create({ key: 'HOOK', name: 'Hook' }, 'test');
		connectProject(app, 'HOOK', 'webhook', { url: 'https://hooks.test/x' });
		app.epics.create(
			'HOOK',
			{
				title: 'E',
				tasks: [{ title: 'T', description: 'Mine', externalRef: { provider: 'webhook', key: 'K' } }]
			},
			'test'
		);
		await app.ticketing.idle();
		expect(calls).toEqual([]);
		expect(app.tasks.get('HOOK-1').description).toBe('Mine');
	});

	it('retries descriptions with current content and skips a retry after the task lost its link', async () => {
		let failing = true;
		const { app, calls } = setup(() =>
			failing ? new Response('error', { status: 503 }) : Response.json({ id: 42 })
		);
		app.tasks.update('SHOP-1', { description: 'Original' }, 'test');
		await app.ticketing.idle();
		const failed = app.ticketing.jobs({ status: 'failed' })[0];
		app.tasks.update('SHOP-1', { description: 'Latest' }, 'test');
		await app.ticketing.idle();
		failing = false;
		await app.ticketing.retry(failed.id);
		expect(bodies(calls).at(-1)).toEqual({ body: 'Latest' });
		app.tasks.update('SHOP-1', { externalRef: null }, 'test');
		await app.ticketing.idle();
		const count = calls.length;
		await app.ticketing.retry(failed.id);
		expect(calls).toHaveLength(count);
	});

	it('keeps comment sync working for jobs queued before descriptions had their own operation', async () => {
		const { app, calls } = setup();
		app.tasks.update('SHOP-1', { description: 'Now' }, 'test');
		await app.ticketing.idle();
		const job = app.ticketing.jobs({})[0];
		app.db
			.prepare('UPDATE sync_jobs SET operation = ?, payload = ?, status = ? WHERE id = ?')
			.run(
				'sync_comment',
				JSON.stringify({ ...job.payload, description: true, commentId: 'task-description:x' }),
				'failed',
				job.id
			);
		const count = calls.length;
		await app.ticketing.retry(job.id);
		expect(writes(calls.slice(count)).map((c) => c.init.method)).toEqual(['PATCH']);
	});

	it('no longer exposes a postComments setting', () => {
		const { app } = setup();
		expect(app.projects.get('SHOP').ticketing).not.toHaveProperty('postComments');
	});

	it('does not sync ordinary task edits', async () => {
		const { app, calls } = setup();
		app.tasks.update('SHOP-1', { title: 'New title' }, 'claude');
		await app.ticketing.idle();
		expect(calls).toEqual([]);
	});
});

describe('provider comment operations', () => {
	const projectId = '3f1c2a5e-1111-4222-8333-444455556666';
	function context() {
		const calls: FetchCall[] = [];
		const ctx: TicketContext = {
			settings: {
				baseUrl: 'https://tracker.test',
				email: 'me@example.com',
				workspaceSlug: 'acme',
				projectId,
				url: 'https://hooks.test/comments'
			},
			secret: 'secret',
			secretEnvVar: null,
			env: {},
			headers: [],
			mapped: null,
			ref: { provider: 'test', key: 'SHOP-7', url: null },
			fetch: (async (url, init = {}) => {
				calls.push({ url: String(url), init });
				if (String(url).includes('/work-items/')) return Response.json({ id: 'issue-id' });
				if (String(url).includes('linear.app')) {
					const { query } = JSON.parse(String(init.body));
					if (query.includes('commentCreate'))
						return Response.json({
							data: { commentCreate: { success: true, comment: { id: 'remote-id' } } }
						});
					if (query.includes('commentUpdate'))
						return Response.json({ data: { commentUpdate: { success: true } } });
					if (query.includes('commentDelete'))
						return Response.json({ data: { commentDelete: { success: true } } });
					return Response.json({ data: { issue: { id: 'issue-id' } } });
				}
				return init.method === 'DELETE'
					? new Response(null, { status: 204 })
					: Response.json({ id: 'remote-id' });
			}) as typeof fetch
		};
		return { ctx, calls };
	}

	it.each([jiraProvider, planeProvider])(
		'creates, edits and deletes comments with $id',
		async (provider) => {
			const { ctx, calls } = context();
			const remoteId = await provider.syncComment!(ctx, {
				id: 'local',
				body: 'First <script>\nNext',
				remoteId: null
			});
			expect(remoteId).toBe('remote-id');
			await provider.syncComment!(ctx, { id: 'local', body: 'Edited', remoteId });
			await provider.syncComment!(ctx, { id: 'local', body: null, remoteId });
			const writes = calls.filter((c) => c.init.method && c.init.method !== 'GET');
			expect(writes.map((c) => c.init.method)).toEqual([
				'POST',
				provider.id === 'jira' ? 'PUT' : 'PATCH',
				'DELETE'
			]);
			expect(writes[1].url).toContain('remote-id');
			expect(writes[2].url).toBe(writes[1].url);
			if (provider.id === 'plane') {
				expect(JSON.parse(String(writes[0].init.body)).comment_html).toBe(
					'<p>First &lt;script&gt;<br>Next</p>'
				);
			} else expect(JSON.parse(String(writes[0].init.body)).body).toBe('First <script>\nNext');
		}
	);

	it('uses only comment mutations for Linear', async () => {
		const { ctx, calls } = context();
		const remoteId = await linearProvider.syncComment!(ctx, {
			id: 'local',
			body: 'First',
			remoteId: null
		});
		await linearProvider.syncComment!(ctx, { id: 'local', body: 'Edited', remoteId });
		await linearProvider.syncComment!(ctx, { id: 'local', body: null, remoteId });
		const queries = calls.map((c) => JSON.parse(String(c.init.body)));
		expect(queries[1].query).toContain('commentCreate');
		expect(queries[2].variables).toEqual({ id: 'remote-id', body: 'Edited' });
		expect(queries[3].query).toContain('commentDelete');
		expect(queries.some((q) => q.query.includes('issueUpdate'))).toBe(false);
	});

	it('sends signed webhook lifecycle events with stable comment IDs', async () => {
		const { ctx, calls } = context();
		const remoteId = await webhookProvider.syncComment!(ctx, {
			id: 'local',
			body: 'First',
			remoteId: null
		});
		await webhookProvider.syncComment!(ctx, { id: 'local', body: 'Edited', remoteId });
		await webhookProvider.syncComment!(ctx, { id: 'local', body: null, remoteId });
		expect(calls.map((c) => JSON.parse(String(c.init.body)).comment.action)).toEqual([
			'create',
			'update',
			'delete'
		]);
		for (const call of calls) {
			expect(JSON.parse(String(call.init.body))).toMatchObject({
				event: 'ticket.comment',
				comment: { id: 'local' }
			});
			expect((call.init.headers as Record<string, string>)['x-pm-signature']).toMatch(/^sha256=/);
		}
	});
});
