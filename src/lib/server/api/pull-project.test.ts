import { describe, expect, it } from 'vitest';
import { connectProject, testApp } from '../testing/app.ts';
import { execute } from './execute.ts';
import { operationsByName } from './operations.ts';

const run = (app: ReturnType<typeof testApp>['app'], input: object) =>
	execute(app, operationsByName.get('pull_project_tickets')!, input, { actor: 'Nick' });

describe('pull_project_tickets', () => {
	it('starts a pull and returns the running status', async () => {
		const { app } = testApp({ GITHUB_TOKEN: 'secret' });
		app.projects.create({ key: 'SHOP', name: 'Shop' }, 'test');
		const connection = connectProject(app, 'SHOP', 'github', { repo: 'acme/shop' });
		app.connections.setProjectTicketing('SHOP', { connectionId: connection.id }, 'test');
		app.epics.create(
			'SHOP',
			{ title: 'E', tasks: [{ title: 'T', externalRef: { provider: 'github', key: '#7' } }] },
			'test'
		);
		expect(await run(app, { project: 'SHOP' })).toMatchObject({ running: true });
		await app.ticketPull.idle();
		expect(app.ticketPull.status('SHOP').running).toBe(false);
	});

	it('answers 409 for a project that cannot pull', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'SHOP', name: 'Shop' }, 'test');
		await expect(run(app, { project: 'SHOP' })).rejects.toMatchObject({
			status: 409,
			body: { error: { code: 'conflict' } }
		});
	});

	it('is hidden from the default MCP tool list', () => {
		expect(operationsByName.get('pull_project_tickets')!.mcp?.hidden).toBe(true);
	});
});
