import { describe, expect, it } from 'vitest';
import { testApp } from '../testing/app.ts';
import { handleMcp } from '../mcp/handler.ts';
import { matchRoute } from './router.ts';
import { buildOpenApi } from './openapi.ts';
import { operations } from './operations.ts';

describe('router', () => {
	it('matches operations and reports allowed methods', () => {
		const match = matchRoute('PUT', '/tasks/PMA-1/stages/dev');
		expect(match && 'op' in match && [match.op.name, match.params]).toEqual([
			'set_task_stage_status',
			{ task: 'PMA-1', stage: 'dev' }
		]);
		expect(matchRoute('POST', '/tasks/PMA-1')).toEqual({ allowed: ['GET', 'PATCH', 'DELETE'] });
		expect(matchRoute('GET', '/nothing')).toBeNull();
	});
});

describe('openapi', () => {
	it('documents every operation', () => {
		const spec = buildOpenApi('http://localhost');
		const ids = Object.values(spec.paths).flatMap((methods) =>
			Object.values(methods).map((m) => (m as { operationId: string }).operationId)
		);
		expect(ids.sort()).toEqual(operations.map((o) => o.name).sort());
	});
});

// Loose shape for asserting on JSON-RPC replies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type McpReply = Record<string, any>;

describe('mcp', () => {
	const call = (
		app: ReturnType<typeof testApp>['app'],
		method: string,
		params?: object,
		id: number | undefined = 1
	) => handleMcp(app, { jsonrpc: '2.0', id, method, params }, 'claude') as Promise<McpReply>;

	it('initializes with instructions and lists every operation as a tool', async () => {
		const { app } = testApp();
		const init = await call(app, 'initialize', { protocolVersion: '2025-06-18' });
		expect(init.result.protocolVersion).toBe('2025-06-18');
		expect(init.result.instructions).toContain('set_task_stage_status');
		const list = await call(app, 'tools/list');
		expect(list.result.tools).toHaveLength(operations.length);
		expect(
			list.result.tools.find((t: { name: string }) => t.name === 'create_epic').inputSchema
				.properties.phases
		).toBeDefined();
	});

	it('runs tools and reports domain errors as tool errors', async () => {
		const { app } = testApp();
		const created = await call(app, 'tools/call', {
			name: 'create_project',
			arguments: { key: 'AI', name: 'Agents' }
		});
		expect(created.result.structuredContent.key).toBe('AI');
		expect(app.activity.forProject('AI').items[0].actor).toBe('claude');

		const missing = await call(app, 'tools/call', {
			name: 'get_epic',
			arguments: { epic: 'AI-E9' }
		});
		expect(missing.result).toMatchObject({
			isError: true,
			content: [{ text: "Epic 'AI-E9' was not found" }]
		});

		const unknown = await call(app, 'tools/call', { name: 'nope' });
		expect(unknown.error.code).toBe(-32602);
	});

	it('pages activity with limit and offset', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'PG', name: 'Paging' }, 'test');
		for (let i = 0; i < 4; i++) app.epics.create('PG', { title: `E${i}` }, 'test');
		const page = async (args: object) =>
			(
				await call(app, 'tools/call', {
					name: 'get_project_activity',
					arguments: { project: 'PG', ...args }
				})
			).result.structuredContent.items;
		expect(await page({})).toHaveLength(5);
		const second = await page({ limit: 2, offset: 2 });
		expect(second.map((a: { id: string }) => a.id)).toEqual(
			(await page({})).slice(2, 4).map((a: { id: string }) => a.id)
		);
	});

	it('answers notifications with nothing and supports batches', async () => {
		const { app } = testApp();
		expect(await call(app, 'notifications/initialized', undefined, undefined)).toBeNull();
		const batch = await handleMcp(
			app,
			[{ jsonrpc: '2.0', id: 1, method: 'ping' }, { bad: true }],
			'x'
		);
		expect(batch).toEqual([
			{ jsonrpc: '2.0', id: 1, result: {} },
			{ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } }
		]);
	});
});
