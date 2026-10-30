import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectProject, testApp, type FetchCall } from '../../../testing/app.ts';

const UUID = '3f1c2a5e-1111-4222-8333-444455556666';
const KEY = 'plane-secret-key-987';
const states = [{ id: 's1', name: 'Todo', group: 'unstarted' }];
const projects = [
	{ id: UUID, name: 'Software', identifier: 'SOFT' },
	{ id: 'other', name: 'Ops', identifier: 'OPS' }
];

function setup(
	baseUrl: string | undefined,
	projectId: string,
	respond?: (call: FetchCall) => Response,
	env: Record<string, string> = {}
) {
	const ctx = testApp(
		env,
		respond ??
			((call) =>
				call.url.endsWith('/states/')
					? Response.json({ results: states })
					: Response.json({ results: projects }))
	);
	ctx.app.projects.create({ key: 'PMA', name: 'PM' }, 'test');
	connectProject(
		ctx.app,
		'PMA',
		'plane',
		{ workspaceSlug: 'acme', projectId, ...(baseUrl ? { baseUrl } : {}) },
		{ secret: undefined }
	);
	return ctx;
}

afterEach(() => vi.restoreAllMocks());

describe('plane listStates', () => {
	it.each(['https://plane.example.com', 'https://plane.example.com/'])(
		'builds the states URL from %s',
		async (baseUrl) => {
			const { app, calls } = setup(baseUrl, UUID, undefined, { PLANE_API_KEY: KEY });
			await app.connections.listStates('PMA');
			expect(calls.map((c) => c.url)).toEqual([
				`https://plane.example.com/api/v1/workspaces/acme/projects/${UUID}/states/`
			]);
		}
	);

	it('extracts the UUID from a pasted Plane URL', async () => {
		const { app, calls } = setup(
			undefined,
			` https://app.plane.so/acme/projects/${UUID}/issues/ `,
			undefined,
			{ PLANE_API_KEY: KEY }
		);
		await app.connections.listStates('PMA');
		expect(calls[0].url).toBe(
			`https://api.plane.so/api/v1/workspaces/acme/projects/${UUID}/states/`
		);
	});

	it('resolves a project identifier to its UUID', async () => {
		const { app, calls } = setup(undefined, 'soft', undefined, { PLANE_API_KEY: KEY });
		await app.connections.listStates('PMA');
		expect(calls.map((c) => c.url)).toEqual([
			'https://api.plane.so/api/v1/workspaces/acme/projects/',
			`https://api.plane.so/api/v1/workspaces/acme/projects/${UUID}/states/`
		]);
	});

	it('rejects an unknown identifier without asking for states', async () => {
		const { app, calls } = setup(undefined, 'NOPE', undefined, { PLANE_API_KEY: KEY });
		await expect(app.connections.listStates('PMA')).rejects.toThrow(
			'Use the Plane project ID (UUID), not the identifier.'
		);
		expect(calls).toHaveLength(1);
	});

	it('refuses an empty project ID before any request', async () => {
		const { app, calls } = setup(undefined, UUID, undefined, { PLANE_API_KEY: KEY });
		await expect(
			app.connections.listStates('PMA', { target: { projectId: '  ' } })
		).rejects.toThrow(/Missing provider setting 'projectId'/);
		expect(calls).toHaveLength(0);
	});

	it('explains an HTML response with its status and hides the key', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { app } = setup(
			'https://app.plane.so',
			UUID,
			() =>
				new Response('<!DOCTYPE html>\n<html>  app </html>', {
					headers: { 'content-type': 'text/html' }
				}),
			{ PLANE_API_KEY: KEY }
		);
		const error = await app.connections.listStates('PMA').catch((e: Error) => e);
		expect((error as Error).message).toBe(
			`Plane returned 200 text/html for GET https://app.plane.so/api/v1/workspaces/acme/projects/${UUID}/states/. Check the base URL and project ID.`
		);
		expect(String(warn.mock.calls[0][0])).toContain(
			'-> 200 text/html <!DOCTYPE html> <html> app </html>'
		);
		expect(JSON.stringify(warn.mock.calls) + (error as Error).message).not.toContain(KEY);
		const test = await app.connections.test(app.connections.list()[0].id);
		expect(test.ok).toBe(false);
	});

	it('logs successful requests only when debugging is on', async () => {
		const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		await setup(undefined, UUID, undefined, { PLANE_API_KEY: KEY }).app.connections.listStates(
			'PMA'
		);
		expect(debug).not.toHaveBeenCalled();
		await setup(undefined, UUID, undefined, {
			PLANE_API_KEY: KEY,
			BRIEFLINE_DEBUG_TICKETING: '1'
		}).app.connections.listStates('PMA');
		expect(debug.mock.calls[0][0]).toMatch(
			/^\[ticketing\] Plane GET https:\/\/api\.plane\.so\S+ -> 200 \d+ms$/
		);
	});
});

describe('plane listProjects', () => {
	it('maps projects to id, name and identifier', async () => {
		const { app } = setup(
			undefined,
			UUID,
			() => Response.json({ results: [{ ...projects[0], extra: 1 }] }),
			{ PLANE_API_KEY: KEY }
		);
		const connection = app.connections.list()[0];
		expect(await app.connections.listProjects(connection.id)).toEqual([projects[0]]);
		expect(app.ticketing.providers().find((p) => p.id === 'plane')?.supportsProjects).toBe(true);
	});
});
