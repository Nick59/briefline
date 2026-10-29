import { describe, expect, it } from 'vitest';
import { testApp } from '../../testing/app.ts';

function setup(
	provider: string,
	settings: Record<string, string>,
	env: Record<string, string> = {},
	status = 200
) {
	const ctx = testApp(env, (call) =>
		call.url.endsWith('/transitions') && !call.init.method
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
	ctx.app.projects.create(
		{
			key: 'PMA',
			name: 'PM',
			ticketing: { provider, settings, autoSync: true, postComments: true }
		},
		'test'
	);
	const epic = ctx.app.epics.create(
		'PMA',
		{ title: 'Launch', phases: [{ name: 'Build', tasks: [{ title: 'API' }] }] },
		'test'
	);
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
			lastError: 'Missing environment variable GITHUB_TOKEN'
		});
		expect((await app.ticketing.retry(job.id)).attempts).toBe(2);
		expect(app.activity.forEpic(epic.id).some((a) => a.action === 'ticket.sync_failed')).toBe(true);
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
