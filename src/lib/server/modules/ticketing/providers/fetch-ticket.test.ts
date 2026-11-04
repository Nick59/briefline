import { describe, expect, it } from 'vitest';
import { connectProject, testApp, type FetchCall } from '../../../testing/app.ts';
import type { RemoteTicket } from '../provider.ts';

const UUID = '3f1c2a5e-1111-4222-8333-444455556666';

function fetchRemote(
	provider: string,
	settings: Record<string, string>,
	ref: string,
	respond: (call: FetchCall) => Response,
	env: Record<string, string> = {}
) {
	const { app, calls } = testApp(env, respond);
	app.projects.create({ key: 'PMA', name: 'PM' }, 'test');
	connectProject(app, 'PMA', provider, settings, { secret: undefined });
	const resolved = app.connections.forProject(app.projects.get('PMA'))!;
	const run = (): Promise<RemoteTicket> =>
		resolved.provider.fetchTicket!({
			...resolved.context,
			ref: { provider, key: ref, url: null },
			mapped: null
		});
	return { run, calls };
}

describe('fetchTicket', () => {
	it('reads a GitHub issue and its comments', async () => {
		const { run, calls } = fetchRemote(
			'github',
			{ repo: 'acme/shop' },
			'#7',
			(call) =>
				call.url.includes('/comments')
					? Response.json([
							{ id: 5, body: 'Hi', user: { login: 'bob' }, created_at: '2026-01-02T00:00:00Z' }
						])
					: Response.json({ title: 'T', body: 'B', state: 'closed' }),
			{ GITHUB_TOKEN: 's' }
		);
		expect(await run()).toEqual({
			title: 'T',
			description: 'B',
			state: { id: 'closed', group: 'completed' },
			comments: [{ id: '5', body: 'Hi', author: 'bob', createdAt: '2026-01-02T00:00:00Z' }]
		});
		expect(calls.map((c) => `${c.init.method ?? 'GET'} ${c.url}`)).toEqual([
			'GET https://api.github.com/repos/acme/shop/issues/7',
			'GET https://api.github.com/repos/acme/shop/issues/7/comments?per_page=100'
		]);
	});

	it('reads a Jira issue with its status category', async () => {
		const { run, calls } = fetchRemote(
			'jira',
			{ baseUrl: 'https://jira.example.com', email: 'a@b.c' },
			'SHOP-1',
			() =>
				Response.json({
					fields: {
						summary: 'Sum',
						description: null,
						status: { id: '3', statusCategory: { key: 'indeterminate' } },
						comment: {
							comments: [
								{ id: '9', body: 'Yo', author: { displayName: 'Ann' }, created: '2026-01-01' }
							]
						}
					}
				}),
			{ JIRA_API_TOKEN: 'token' }
		);
		expect(await run()).toEqual({
			title: 'Sum',
			description: null,
			state: { id: '3', group: 'started' },
			comments: [{ id: '9', body: 'Yo', author: 'Ann', createdAt: '2026-01-01' }]
		});
		expect(calls[0].url).toBe(
			'https://jira.example.com/rest/api/2/issue/SHOP-1?fields=summary,description,status,comment'
		);
	});

	it('reads a Linear issue with one GraphQL request', async () => {
		const { run, calls } = fetchRemote(
			'linear',
			{},
			'ENG-3',
			() =>
				Response.json({
					data: {
						issue: {
							title: 'L',
							description: 'D',
							state: { id: 'st', type: 'completed' },
							comments: {
								nodes: [{ id: 'c1', body: 'x', createdAt: '2026-01-01', user: { name: 'Zed' } }]
							}
						}
					}
				}),
			{ LINEAR_API_KEY: 'key' }
		);
		expect(await run()).toEqual({
			title: 'L',
			description: 'D',
			state: { id: 'st', group: 'completed' },
			comments: [{ id: 'c1', body: 'x', author: 'Zed', createdAt: '2026-01-01' }]
		});
		expect(calls).toHaveLength(1);
		expect(calls[0].init.method).toBe('POST');
		expect(JSON.parse(String(calls[0].init.body)).variables).toEqual({ id: 'ENG-3' });
	});

	it('throws on a Linear GraphQL error', async () => {
		const { run } = fetchRemote(
			'linear',
			{},
			'ENG-3',
			() => Response.json({ errors: [{ message: 'Entity not found' }] }),
			{ LINEAR_API_KEY: 'key' }
		);
		await expect(run()).rejects.toThrow('Linear: Entity not found');
	});

	const plane = (respond: (call: FetchCall) => Response) =>
		fetchRemote('plane', { workspaceSlug: 'acme', projectId: UUID }, 'SOFT-1', respond, {
			PLANE_API_KEY: 'key'
		});

	it('reads a Plane work item with an expanded state', async () => {
		const { run, calls } = plane((call) =>
			call.url.includes('/comments/')
				? Response.json({
						results: [
							{
								id: 'k1',
								comment_stripped: 'Note',
								actor_detail: { display_name: 'Pat' },
								created_at: '2026-01-01'
							}
						]
					})
				: Response.json({
						id: 'wi',
						name: 'P',
						description_stripped: 'Desc',
						state: { id: 's1', group: 'started' }
					})
		);
		expect(await run()).toEqual({
			title: 'P',
			description: 'Desc',
			state: { id: 's1', group: 'started' },
			comments: [{ id: 'k1', body: 'Note', author: 'Pat', createdAt: '2026-01-01' }]
		});
		expect(calls.map((c) => c.url)).toEqual([
			'https://api.plane.so/api/v1/workspaces/acme/work-items/SOFT-1/?expand=state',
			`https://api.plane.so/api/v1/workspaces/acme/projects/${UUID}/issues/wi/comments/`
		]);
	});

	it('resolves the group from the states list when the state is a plain id', async () => {
		const { run } = plane((call) =>
			call.url.includes('/comments/')
				? Response.json({ results: [] })
				: call.url.endsWith('/states/')
					? Response.json({ results: [{ id: 's9', name: 'Done', group: 'completed' }] })
					: Response.json({ id: 'wi', name: 'P', description_stripped: '', state: 's9' })
		);
		expect((await run()).state).toEqual({ id: 's9', group: 'completed' });
	});

	it('throws on a Plane rate limit', async () => {
		const { run } = plane(() => new Response('slow down', { status: 429 }));
		await expect(run()).rejects.toThrow('rate limit');
	});

	it('is not offered by the webhook and dry-run providers', () => {
		const { app } = testApp();
		const pull = Object.fromEntries(app.ticketing.providers().map((p) => [p.id, p.supportsPull]));
		expect(pull).toEqual({
			github: true,
			jira: true,
			linear: true,
			plane: true,
			webhook: false,
			'dry-run': false
		});
	});
});
