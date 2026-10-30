import { describe, expect, it } from 'vitest';
import { testApp } from '../testing/app.ts';
import { handleMcp } from '../mcp/handler.ts';
import { matchRoute } from './router.ts';
import { buildOpenApi } from './openapi.ts';
import { operations, operationsByName } from './operations.ts';
import { execute } from './execute.ts';

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
				.properties.tasks
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

	it('pages activity with limit and offset and reports paging details', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'PG', name: 'Paging' }, 'test');
		for (let i = 0; i < 4; i++) app.epics.create('PG', { title: `E${i}` }, 'test');
		const page = async (args: object) =>
			(
				await call(app, 'tools/call', {
					name: 'get_project_activity',
					arguments: { project: 'PG', ...args }
				})
			).result.structuredContent;
		const all = await page({});
		expect(all).toMatchObject({
			total: 5,
			limit: 10,
			offset: 0,
			hasMore: false,
			nextOffset: null
		});
		expect(all.items).toHaveLength(5);

		const first = await page({ limit: 2 });
		expect(first).toMatchObject({ total: 5, limit: 2, offset: 0, hasMore: true, nextOffset: 2 });
		const second = await page({ limit: 2, offset: 2 });
		expect(second).toMatchObject({ offset: 2, hasMore: true, nextOffset: 4 });
		expect(second.items.map((a: { id: string }) => a.id)).toEqual(
			all.items.slice(2, 4).map((a: { id: string }) => a.id)
		);
		const last = await page({ limit: 2, offset: 4 });
		expect(last).toMatchObject({ offset: 4, hasMore: false, nextOffset: null });
		expect(last.items).toHaveLength(1);
	});

	it('pages epic activity and describes the paging in the tool and OpenAPI', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'PE', name: 'Paging' }, 'test');
		app.epics.create('PE', { title: 'E' }, 'test');
		const result = (
			await call(app, 'tools/call', { name: 'get_epic_activity', arguments: { epic: 'PE-E1' } })
		).result.structuredContent;
		expect(result).toMatchObject({ limit: 10, offset: 0, hasMore: false, nextOffset: null });
		expect(result.items).toBeInstanceOf(Array);
		expect(result.items.items).toBeUndefined();

		const tools = (await call(app, 'tools/list')).result.tools as {
			name: string;
			description: string;
		}[];
		for (const name of ['get_project_activity', 'get_epic_activity'])
			expect(tools.find((t) => t.name === name)?.description).toContain('Paginated, newest first');
		const spec = JSON.stringify(buildOpenApi('http://localhost'));
		expect(spec).toContain('use `offset`/`nextOffset` and `hasMore`');
	});

	it('requires the agent to write the human brief over MCP only', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'BR', name: 'Briefs' }, 'test');
		app.epics.create('BR', { title: 'E' }, 'test');
		const brief = {
			summary: 'Checkout gets faster.',
			whyItMatters: 'Fewer abandoned carts.',
			whatChanges: ['Pages load sooner'],
			acceptance: [],
			risks: [],
			openQuestions: [],
			glossary: [],
			effort: 'M',
			readingMinutes: 1
		};
		const tool = (name: string, args: object) =>
			call(app, 'tools/call', { name, arguments: args }).then((r) => r.result);

		const tools = (await call(app, 'tools/list')).result.tools as {
			name: string;
			inputSchema: { required?: string[] };
		}[];
		expect(tools.find((t) => t.name === 'add_epic_spec')?.inputSchema.required).toContain('brief');
		expect(tools.find((t) => t.name === 'set_spec_brief')?.inputSchema.required).toContain('brief');

		const missing = await tool('add_epic_spec', {
			epic: 'BR-E1',
			title: 'Plan',
			content: '# Plan'
		});
		expect(missing.isError).toBe(true);
		expect(missing.content[0].text).toContain('brief is required');

		const created = await tool('add_epic_spec', {
			epic: 'BR-E1',
			title: 'Plan',
			content: '# Plan',
			brief
		});
		expect(created.structuredContent.brief).toMatchObject({ source: 'agent:claude', effort: 'M' });
		const id = created.structuredContent.id as string;

		const noBrief = await tool('update_spec', { spec: id, content: '# Plan v2' });
		expect(noBrief.isError).toBe(true);
		const titleOnly = await tool('update_spec', { spec: id, title: 'Renamed' });
		expect(titleOnly.isError).toBeUndefined();
		expect(titleOnly.structuredContent.brief.summary).toBe(brief.summary);
		const rewritten = await tool('update_spec', {
			spec: id,
			content: '# Plan v2',
			brief: { ...brief, summary: 'Checkout is much faster.' }
		});
		expect(rewritten.structuredContent.brief.summary).toBe('Checkout is much faster.');

		const set = await tool('set_spec_brief', { spec: id, brief: { ...brief, effort: 'L' } });
		expect(set.structuredContent).toMatchObject({ content: '# Plan v2', brief: { effort: 'L' } });
		const invalid = await tool('set_spec_brief', { spec: id, brief: { ...brief, effort: 'HUGE' } });
		expect(invalid.isError).toBe(true);

		const epicPlan = await tool('create_epic', {
			project: 'BR',
			title: 'Planned',
			specs: [{ title: 'S', content: 'x' }]
		});
		expect(epicPlan.isError).toBe(true);

		const http = (name: string, input: object) =>
			execute(app, operationsByName.get(name)!, input, { actor: 'dashboard' }) as Promise<{
				brief: unknown;
			}>;
		const plain = await http('add_epic_spec', { epic: 'BR-E1', title: 'Human', content: 'text' });
		expect(plain.brief).toBeNull();
		await expect(http('update_spec', { spec: id, content: 'edited' })).resolves.toMatchObject({
			brief: null
		});
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
