import { describe, expect, it } from 'vitest';
import { planeProvider } from './providers/plane.ts';
import { connectProject, testApp, type FetchCall } from '../../testing/app.ts';

const PROJECT_UUID = '3f1c2a5e-1111-4222-8333-444455556666';

function setup(
	provider: string,
	settings: Record<string, string>,
	env: Record<string, string> = {},
	status = 200,
	custom?: (call: FetchCall) => Response,
	statusMapping?: Record<string, { id: string; name: string }>
) {
	const ctx = testApp(env, (call) =>
		custom
			? custom(call)
			: call.url.endsWith('/transitions') && !call.init.method
				? Response.json({
						transitions: [
							{
								id: '31',
								name: 'Start',
								to: { name: 'In Progress', statusCategory: { key: 'indeterminate' } }
							}
						]
					})
				: new Response('{}', { status })
	);
	ctx.app.projects.create({ key: 'PMA', name: 'PM' }, 'test');
	connectProject(ctx.app, 'PMA', provider, settings, { statusMapping });
	const epic = ctx.app.epics.create('PMA', { title: 'Launch', tasks: [{ title: 'API' }] }, 'test');
	ctx.app.epics.approveSpecs(epic.id, 'dashboard');
	return { ...ctx, epic };
}

describe('ticket sync', () => {
	it('updates the linked GitHub issue when a task moves', async () => {
		const { app, calls, epic } = setup('github', { repo: 'acme/shop' }, { GITHUB_TOKEN: 'secret' });
		app.epics.update(epic.id, { externalRef: { provider: 'github', key: '#42' } }, 'test');
		await app.ticketing.idle();
		calls.length = 0;

		app.tasks.setStage('PMA-1', { stage: 'dev', status: 'in_progress' }, 'claude');
		await app.ticketing.idle();

		expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
			'PATCH https://api.github.com/repos/acme/shop/issues/42',
			'POST https://api.github.com/repos/acme/shop/issues/42/comments'
		]);
		expect(JSON.parse(String(calls[0].init.body))).toEqual({ state: 'open' });
		expect(String(calls[1].init.body)).toContain('Dev → In progress');
		expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer secret');
		expect(app.ticketing.jobs({ epicId: epic.id })[0].status).toBe('succeeded');
	});

	it('closes the issue when every task is deployed', async () => {
		const { app, calls, epic } = setup('github', {}, { GITHUB_TOKEN: 't' });
		app.epics.update(epic.id, { externalRef: { provider: 'github', key: 'acme/shop#7' } }, 'test');
		for (const stage of ['dev', 'test', 'deploy'] as const)
			app.tasks.setStage('PMA-1', { stage, status: 'done' }, 'test');
		await app.ticketing.idle();
		expect(JSON.parse(String(calls.at(-2)!.init.body))).toEqual({
			state: 'closed',
			state_reason: 'completed'
		});
	});

	it('moves a Jira issue to the matching status category', async () => {
		const { app, calls, epic } = setup(
			'jira',
			{ baseUrl: 'https://acme.atlassian.net' },
			{ JIRA_EMAIL: 'a@b.c', JIRA_API_TOKEN: 'x' }
		);
		app.epics.update(epic.id, { externalRef: { provider: 'jira', key: 'SHOP-1' } }, 'test');
		await app.ticketing.idle();
		const transition = calls.find(
			(c) => c.init.method === 'POST' && c.url.endsWith('/transitions')
		);
		expect(transition).toBeUndefined();

		app.tasks.setStage('PMA-1', { stage: 'dev', status: 'in_progress' }, 'test');
		await app.ticketing.idle();
		const moved = calls.find((c) => c.init.method === 'POST' && c.url.endsWith('/transitions'));
		expect(JSON.parse(String(moved!.init.body))).toEqual({ transition: { id: '31' } });
	});

	it('records failures and lets them be retried', async () => {
		const { app, epic } = setup('github', {}, {}, 500);
		app.epics.update(epic.id, { externalRef: { provider: 'github', key: 'acme/shop#1' } }, 'test');
		await app.ticketing.idle();
		const [job] = app.ticketing.jobs({ epicId: epic.id });
		expect(job).toMatchObject({
			status: 'failed',
			lastError: expect.stringContaining('GITHUB_TOKEN is not set')
		});
		expect((await app.ticketing.retry(job.id)).attempts).toBe(2);
		expect(app.activity.forEpic(epic.id).items.some((a) => a.action === 'ticket.sync_failed')).toBe(
			true
		);
	});

	it('does nothing when the ticket belongs to another provider or sync is off', async () => {
		const { app, calls, epic } = setup('webhook', { url: 'https://hooks.example.com' });
		app.epics.update(epic.id, { externalRef: { provider: 'jira', key: 'X-1' } }, 'test');
		app.tasks.setStage('PMA-1', { stage: 'dev', status: 'done' }, 'test');
		await app.ticketing.idle();
		expect(calls).toHaveLength(0);
	});

	it('signs webhook payloads', async () => {
		const { app, calls, epic } = setup(
			'webhook',
			{ url: 'https://hooks.example.com/t' },
			{ PM_WEBHOOK_SECRET: 's3cret' }
		);
		app.epics.update(epic.id, { externalRef: { provider: 'webhook', key: 'T-1' } }, 'test');
		await app.ticketing.idle();
		const headers = calls[0].init.headers as Record<string, string>;
		expect(headers['x-pm-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
		expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
			event: 'ticket.update',
			ticket: { key: 'T-1' }
		});
	});
});

describe('status mapping on other providers', () => {
	it('moves a Jira issue through the transition that leads to the mapped status', async () => {
		const respond = (call: FetchCall) => {
			if (call.url.endsWith('/transitions') && !call.init.method)
				return Response.json({
					transitions: [
						{
							id: '11',
							name: 'Review',
							to: { id: '300', name: 'In Review', statusCategory: { key: 'indeterminate' } }
						},
						{
							id: '12',
							name: 'Start',
							to: { id: '200', name: 'In Progress', statusCategory: { key: 'indeterminate' } }
						}
					]
				});
			if (call.url.includes('?fields=status'))
				return Response.json({ fields: { status: { id: '100' } } });
			return Response.json({});
		};
		const { app, calls, epic } = setup(
			'jira',
			{ baseUrl: 'https://acme.atlassian.net' },
			{ JIRA_EMAIL: 'a@b.c', JIRA_API_TOKEN: 'x' },
			200,
			respond,
			{ test: { id: '300', name: 'In Review' } }
		);
		app.epics.update(epic.id, { externalRef: { provider: 'jira', key: 'SHOP-1' } }, 'test');
		await app.ticketing.idle();
		app.tasks.setStage('PMA-1', { stage: 'dev', status: 'done' }, 'test');
		await app.ticketing.idle();
		const post = calls.filter((c) => c.init.method === 'POST' && c.url.endsWith('/transitions'));
		expect(JSON.parse(String(post.at(-1)!.init.body))).toEqual({ transition: { id: '11' } });
	});

	it('honours the mapped GitHub state', async () => {
		const { app, calls, epic } = setup('github', {}, { GITHUB_TOKEN: 't' }, 200, undefined, {
			dev: { id: 'closed', name: 'Closed' }
		});
		app.epics.update(epic.id, { externalRef: { provider: 'github', key: 'acme/shop#7' } }, 'test');
		await app.ticketing.idle();
		calls.length = 0;
		app.tasks.setStage('PMA-1', { stage: 'dev', status: 'in_progress' }, 'test');
		await app.ticketing.idle();
		expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ state: 'closed' });
	});
});

describe('plane provider', () => {
	const settings = { workspaceSlug: 'acme', projectId: PROJECT_UUID };
	const states = [
		{ id: 's-back', name: 'Backlog', group: 'backlog' },
		{ id: 's-todo', name: 'Todo', group: 'unstarted' },
		{ id: 's-doing', name: 'In Progress', group: 'started' },
		{ id: 's-done', name: 'Done', group: 'completed' }
	];

	function planeSetup(
		env: Record<string, string> = { PLANE_API_KEY: 'k' },
		lookupStatus = 200,
		statusMapping?: Record<string, { id: string; name: string }>
	) {
		const ctx = setup(
			'plane',
			settings,
			env,
			200,
			(call) => {
				if (call.url.includes('/work-items/'))
					return lookupStatus === 200
						? Response.json({ id: 'issue-uuid', sequence_id: 12 })
						: new Response('slow down', { status: lookupStatus });
				if (call.url.endsWith('/states/')) return Response.json({ results: states });
				return Response.json({});
			},
			statusMapping
		);
		ctx.app.epics.update(
			ctx.epic.id,
			{ externalRef: { provider: 'plane', key: 'SOFT-12' } },
			'test'
		);
		return ctx;
	}

	it('moves the work item to the state of the matching group', async () => {
		const { app, calls } = planeSetup();
		await app.ticketing.idle();
		calls.length = 0;

		app.tasks.setStage('PMA-1', { stage: 'dev', status: 'in_progress' }, 'test');
		await app.ticketing.idle();

		expect(calls[0].url).toBe('https://api.plane.so/api/v1/workspaces/acme/work-items/SOFT-12/');
		expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBe('k');
		const patch = calls.find((c) => c.init.method === 'PATCH')!;
		expect(patch.url).toBe(
			`https://api.plane.so/api/v1/workspaces/acme/projects/${PROJECT_UUID}/issues/issue-uuid/`
		);
		expect(JSON.parse(String(patch.init.body))).toEqual({ state: 's-doing' });
		expect(calls.some((c) => c.url.endsWith('/issues/issue-uuid/comments/'))).toBe(true);
	});

	it('builds the browse URL for cloud and self-hosted', () => {
		const ref = { provider: 'plane', key: 'SOFT-12', url: null };
		const provider = planeProvider;
		expect(provider.ticketUrl(ref, settings)).toBe('https://app.plane.so/acme/browse/SOFT-12/');
		expect(provider.ticketUrl(ref, { ...settings, baseUrl: 'https://plane.example.com/' })).toBe(
			'https://plane.example.com/acme/browse/SOFT-12/'
		);
	});

	it('reports a rate limit as a failed job', async () => {
		const { app, epic } = planeSetup({ PLANE_API_KEY: 'k' }, 429);
		await app.ticketing.idle();
		const [job] = app.ticketing.jobs({ epicId: epic.id });
		expect(job.status).toBe('failed');
		expect(job.lastError).toContain('rate limit');
	});

	it('fails clearly when configuration is missing', async () => {
		const { app, epic } = planeSetup({});
		await app.ticketing.idle();
		expect(app.ticketing.jobs({ epicId: epic.id })[0].lastError).toContain(
			'PLANE_API_KEY is not set'
		);
	});

	const patched = (calls: FetchCall[]) =>
		calls
			.filter((c) => c.init.method === 'PATCH')
			.map((c) => JSON.parse(String(c.init.body)).state);

	it('pushes the state mapped to the current stage', async () => {
		const { app, calls, epic } = planeSetup({ PLANE_API_KEY: 'k' }, 200, {
			not_started: { id: 's-back', name: 'Backlog' },
			dev: { id: 's-back', name: 'Backlog' },
			test: { id: 's-done', name: 'Done' }
		});
		await app.ticketing.idle();
		calls.length = 0;

		app.tasks.setStage('PMA-1', { stage: 'dev', status: 'done' }, 'test');
		await app.ticketing.idle();

		expect(patched(calls)).toEqual(['s-done']);
		expect(app.ticketing.jobs({ epicId: epic.id })[0].message).toBeNull();
	});

	it('uses the group default for keys that are not mapped', async () => {
		const { app, calls } = planeSetup({ PLANE_API_KEY: 'k' }, 200, {
			done: { id: 's-done', name: 'Done' }
		});
		await app.ticketing.idle();
		calls.length = 0;

		app.tasks.setStage('PMA-1', { stage: 'dev', status: 'in_progress' }, 'test');
		await app.ticketing.idle();

		expect(patched(calls)).toEqual(['s-doing']);
	});

	it('falls back to the default and says so when the mapped state is gone', async () => {
		const { app, calls, epic } = planeSetup({ PLANE_API_KEY: 'k' }, 200, {
			dev: { id: 'deleted-state', name: 'Review' }
		});
		await app.ticketing.idle();
		calls.length = 0;

		app.tasks.setStage('PMA-1', { stage: 'dev', status: 'in_progress' }, 'test');
		await app.ticketing.idle();

		expect(patched(calls)).toEqual(['s-doing']);
		const [job] = app.ticketing.jobs({ epicId: epic.id });
		expect(job.status).toBe('succeeded');
		expect(job.message).toContain("'Review' no longer exists");
	});

	it('lists the states of the project including their groups', async () => {
		const { app } = planeSetup();
		expect(await app.connections.listStates('PMA')).toEqual(states);
	});
});
