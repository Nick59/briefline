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

describe('project specs', () => {
	const brief = {
		summary: 'Conventions are written down.',
		whyItMatters: 'Agents follow them.',
		whatChanges: [],
		acceptance: [],
		risks: [],
		openQuestions: [],
		glossary: [],
		effort: 'S',
		readingMinutes: 1
	};
	const run = (app: ReturnType<typeof testApp>['app'], name: string, input: object) =>
		execute(app, operationsByName.get(name)!, input, { actor: 'dashboard' }) as Promise<
			Record<string, unknown> & { id: string }
		>;

	it('creates, lists and includes project specs in get_project', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'shop', name: 'Shop' }, 'test');
		const created = await run(app, 'add_project_spec', {
			project: 'SHOP',
			title: 'Conventions',
			content: '# Rules'
		});
		expect(created).toMatchObject({ epicId: null, taskId: null, viewedAt: null });
		const listed = (await run(app, 'list_project_specs', { project: 'shop' })) as unknown as {
			id: string;
		}[];
		expect(listed.map((s) => s.id)).toEqual([created.id]);
		expect(listed[0]).not.toHaveProperty('content');
		const project = await run(app, 'get_project', { project: 'SHOP' });
		expect(project.specs).toHaveLength(1);
		expect(
			app.activity.forProject('SHOP').items.find((item) => item.action === 'spec.created')
		).toMatchObject({ epicId: null });
	});

	it('does not leak project specs into epics', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'shop', name: 'Shop' }, 'test');
		app.epics.create('SHOP', { title: 'E' }, 'test');
		await run(app, 'add_project_spec', { project: 'SHOP', title: 'P', content: 'x' });
		expect(app.specs.listForEpic('SHOP-E1', true)).toEqual([]);
	});

	it('updates, translates and deletes a project spec', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'shop', name: 'Shop' }, 'test');
		const { id } = await run(app, 'add_project_spec', {
			project: 'SHOP',
			title: 'Arch',
			content: '# Arch'
		});
		await expect(
			run(app, 'update_spec', { spec: id, title: 'Architecture' })
		).resolves.toMatchObject({ title: 'Architecture' });
		await expect(run(app, 'set_spec_brief', { spec: id, brief })).resolves.toMatchObject({
			brief: { summary: brief.summary }
		});
		const translated = await run(app, 'translate_spec', { spec: id, engine: 'heuristic' });
		expect(translated.brief).not.toBeNull();
		await run(app, 'delete_spec', { spec: id });
		await expect(run(app, 'list_project_specs', { project: 'SHOP' })).resolves.toEqual([]);
	});

	it('removes project specs with the project', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'shop', name: 'Shop' }, 'test');
		await run(app, 'add_project_spec', { project: 'SHOP', title: 'P', content: 'x' });
		app.projects.delete('SHOP');
		expect(app.db.prepare('SELECT COUNT(*) AS n FROM specs').get()).toEqual({ n: 0 });
	});

	it('requires a brief over MCP', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'shop', name: 'Shop' }, 'test');
		const tool = (args: object) =>
			handleMcp(
				app,
				{
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name: 'add_project_spec', arguments: args }
				},
				'claude'
			) as Promise<McpReply>;
		const list = (await handleMcp(
			app,
			{ jsonrpc: '2.0', id: 1, method: 'tools/list' },
			'x'
		)) as McpReply;
		expect(
			list.result.tools.find((t: { name: string }) => t.name === 'add_project_spec').inputSchema
				.required
		).toContain('brief');
		const missing = (await tool({ project: 'SHOP', title: 'P', content: 'x' })).result;
		expect(missing.isError).toBe(true);
		const ok = (await tool({ project: 'SHOP', title: 'P', content: 'x', brief })).result;
		expect(ok.isError).toBeUndefined();
		expect(ok.structuredContent.brief).toMatchObject({ source: 'agent:claude' });
	});
});

describe('viewed specs', () => {
	const setup = () => {
		const { app } = testApp();
		app.projects.create({ key: 'shop', name: 'Shop' }, 'test');
		const spec = app.specs.createForProject('SHOP', { title: 'S', content: 'one' }, 'test');
		return { app, id: spec.id };
	};
	const brief = {
		summary: 's',
		whyItMatters: 'w',
		whatChanges: [],
		acceptance: [],
		risks: [],
		openQuestions: [],
		glossary: [],
		effort: 'S' as const,
		readingMinutes: 1
	};

	it('is marked by opening in the dashboard, not by API reads', async () => {
		const { app, id } = setup();
		const get = () =>
			execute(
				app,
				operationsByName.get('get_spec')!,
				{ spec: id },
				{ actor: 'claude' }
			) as Promise<{
				viewedAt: string | null;
			}>;
		expect((await get()).viewedAt).toBeNull();
		expect(app.specs.listForProject('SHOP')[0].viewedAt).toBeNull();
		const before = app.activity.forProject('SHOP').total;
		app.specs.markViewed(id);
		expect((await get()).viewedAt).not.toBeNull();
		expect(app.specs.listForProject('SHOP')[0].viewedAt).not.toBeNull();
		expect(app.activity.forProject('SHOP').total).toBe(before);
	});

	it('resets when the content changes but not for brief-only changes', () => {
		const { app, id } = setup();
		app.specs.markViewed(id);
		app.specs.setBrief(id, { brief }, 'claude');
		expect(app.specs.get(id).viewedAt).not.toBeNull();
		app.specs.update(id, { title: 'Renamed' }, 'claude');
		expect(app.specs.get(id).viewedAt).not.toBeNull();
		app.specs.update(id, { content: 'two' }, 'claude');
		expect(app.specs.get(id).viewedAt).toBeNull();
	});

	it('keeps the viewed state when a brief is translated', async () => {
		const { app, id } = setup();
		app.specs.markViewed(id);
		await app.specs.translate(id, 'dashboard', 'heuristic');
		expect(app.specs.get(id).viewedAt).not.toBeNull();
	});
});

describe('epic questions', () => {
	const setup = () => {
		const { app } = testApp();
		app.projects.create({ key: 'shop', name: 'Shop' }, 'test');
		app.epics.create(
			'SHOP',
			{ title: 'Checkout', tasks: [{ title: 'One' }, { title: 'Two' }] },
			'test'
		);
		return app;
	};
	type App = ReturnType<typeof setup>;
	const run = (app: App, name: string, input: object, actor = 'dashboard') =>
		execute(app, operationsByName.get(name)!, input, { actor }) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
	const ask = (app: App, ...questions: string[]) =>
		run(
			app,
			'add_epic_questions',
			{ epic: 'SHOP-E1', questions: questions.map((question) => ({ question })) },
			'claude'
		) as Promise<{ id: string }[]>;
	const start = (app: App, task = 'SHOP-1') =>
		run(app, 'set_task_stage_status', { task, stage: 'dev', status: 'in_progress' });

	it('adds, lists, filters and returns questions with the epic', async () => {
		const app = setup();
		const [first] = await run(
			app,
			'add_epic_questions',
			{
				epic: 'shop-e1',
				questions: [
					{ question: 'Which **provider**?', context: 'Billing', options: ['Stripe', 'Adyen'] },
					{ question: 'Guest checkout?' }
				]
			},
			'claude'
		);
		expect(first).toMatchObject({
			status: 'open',
			context: 'Billing',
			options: ['Stripe', 'Adyen'],
			askedBy: 'claude',
			answer: null
		});
		const all = await run(app, 'list_epic_questions', { epic: 'SHOP-E1' });
		expect(all.map((q: { position: number }) => q.position)).toEqual([0, 1]);
		expect(all[1]).toMatchObject({ context: null, options: [] });
		await run(app, 'ignore_question', { question: all[1].id });
		const open = await run(app, 'list_epic_questions', { epic: 'SHOP-E1', status: 'open' });
		expect(open).toHaveLength(1);
		const epic = await run(app, 'get_epic', { epic: 'SHOP-E1' });
		expect(epic.questions).toHaveLength(2);
		expect(epic.openQuestions).toBe(1);
		expect(epic.questionCount).toBe(2);
		const openIn = async () => {
			const listed = await run(app, 'list_epics', { project: 'SHOP' });
			const project = await run(app, 'get_project', { project: 'SHOP' });
			const find = (epics: { key: string; openQuestions: number; questionCount: number }[]) =>
				epics.find((e) => e.key === 'SHOP-E1');
			const count = (epics: Parameters<typeof find>[0]) => find(epics)?.openQuestions;
			expect(find(listed)?.questionCount).toBe(2);
			expect(find(project.epics)?.questionCount).toBe(2);
			expect(count(project.epics)).toBe(count(listed));
			return count(listed);
		};
		expect(await openIn()).toBe(1);
		await run(app, 'answer_question', { question: open[0].id, answer: 'Stripe' });
		expect(await openIn()).toBe(0);
		await expect(
			run(app, 'add_epic_questions', { epic: 'SHOP-E1', questions: [] })
		).rejects.toThrow();
	});

	it('lists a short question message with the question id in activity', async () => {
		const app = setup();
		const [q] = await ask(app, '**Which** database should we use?');
		await run(app, 'answer_question', { question: q.id, answer: 'Postgres' }, 'nick');
		const { items } = await run(app, 'list_activity', {});
		const answered = items.find((i: { action: string }) => i.action === 'question.answered');
		expect(answered.message).toBe('Answered \u201cWhich database should we use?\u201d: Postgres');
		expect(answered.data.questionId).toBe(q.id);
		const added = items.find((i: { action: string }) => i.action === 'question.added');
		expect(added.message).toBe('Asked \u201cWhich database should we use?\u201d on SHOP-E1');
	});

	it('answers, ignores, reopens, updates and deletes', async () => {
		const app = setup();
		const [q] = await ask(app, 'Which?');
		const answered = await run(
			app,
			'answer_question',
			{ question: q.id, answer: 'Stripe' },
			'nick'
		);
		expect(answered).toMatchObject({ status: 'answered', answer: 'Stripe', answeredBy: 'nick' });
		expect(answered.answeredAt).not.toBeNull();
		await expect(run(app, 'answer_question', { question: q.id, answer: '  ' })).rejects.toThrow();
		const ignored = await run(app, 'ignore_question', { question: q.id });
		expect(ignored).toMatchObject({ status: 'ignored', answer: null });
		const reopened = await run(app, 'reopen_question', { question: q.id });
		expect(reopened).toMatchObject({
			status: 'open',
			answer: null,
			answeredBy: null,
			answeredAt: null
		});
		const updated = await run(app, 'update_question', {
			question: q.id,
			context: 'More',
			options: ['A']
		});
		expect(updated).toMatchObject({ question: 'Which?', context: 'More', options: ['A'] });
		await run(app, 'delete_question', { question: q.id });
		await expect(run(app, 'delete_question', { question: q.id })).rejects.toMatchObject({
			status: 404
		});
	});

	it('replies in a thread without changing its status', async () => {
		const app = setup();
		const [q] = await ask(app, 'Which?');
		const first = await run(app, 'reply_to_question', { question: q.id, body: 'More **detail**' });
		expect(first).toMatchObject({ questionId: q.id, author: 'dashboard', body: 'More **detail**' });
		await run(app, 'answer_question', { question: q.id, answer: 'Stripe' }, 'nick');
		await run(app, 'reply_to_question', { question: q.id, body: 'Noted' }, 'claude');
		const [listed] = await run(app, 'list_epic_questions', { epic: 'SHOP-E1' });
		expect(listed.status).toBe('answered');
		expect(listed.messages.map((m: { author: string }) => m.author)).toEqual([
			'dashboard',
			'claude'
		]);
		const epic = await run(app, 'get_epic', { epic: 'SHOP-E1' });
		expect(epic.questions[0].messages).toHaveLength(2);
		expect(app.questions.get(q.id).messages).toHaveLength(2);

		const { items } = await run(app, 'list_activity', {});
		const replied = items.find((i: { action: string }) => i.action === 'question.replied');
		expect(replied.message).toBe('Replied in thread \u201cWhich?\u201d');
		expect(replied.data).toMatchObject({ questionId: q.id, body: 'Noted' });

		await expect(run(app, 'reply_to_question', { question: q.id, body: '  ' })).rejects.toThrow();
		await expect(
			run(app, 'reply_to_question', { question: 'missing', body: 'x' })
		).rejects.toMatchObject({ status: 404 });
	});

	it('replies over MCP', async () => {
		const app = setup();
		const [q] = await ask(app, 'Which?');
		const reply = (await handleMcp(
			app,
			{
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name: 'reply_to_question', arguments: { question: q.id, body: 'From agent' } }
			},
			'claude'
		)) as McpReply;
		expect(reply.result.structuredContent).toMatchObject({ author: 'claude', body: 'From agent' });
		expect(app.questions.get(q.id).messages).toHaveLength(1);
	});

	it('refuses to start a task while questions are open', async () => {
		const app = setup();
		const [a, b] = await ask(app, 'One?', 'Two?');
		const blocked = await start(app).catch((e) => e);
		expect(blocked).toMatchObject({
			status: 409,
			body: {
				error: {
					code: 'open_questions',
					message:
						'Epic SHOP-E1 has 2 open questions. Answer or ignore them before starting a task (list_epic_questions).'
				}
			}
		});
		await expect(
			run(app, 'set_task_stage_status', { task: 'SHOP-1', stage: 'dev', status: 'done' })
		).rejects.toMatchObject({ status: 409 });
		await expect(
			run(app, 'move_task', { task: 'SHOP-1', stage: 'dev', status: 'in_progress' })
		).rejects.toMatchObject({ status: 409, body: { error: { code: 'open_questions' } } });
		await expect(
			run(app, 'update_task', { task: 'SHOP-1', stages: { test: 'in_progress' } })
		).rejects.toMatchObject({ status: 409 });
		expect(app.tasks.get('SHOP-1').stages.dev).toBe('todo');
		await run(app, 'move_task', { task: 'SHOP-1', beforeTask: null });

		await run(app, 'answer_question', { question: a.id, answer: 'x' });
		await expect(start(app)).rejects.toThrow('has 1 open question.');
		await run(app, 'ignore_question', { question: b.id });
		await expect(start(app)).resolves.toMatchObject({ stages: { dev: 'in_progress' } });
	});

	it('lets started work continue and allows moving back to todo', async () => {
		const app = setup();
		await start(app);
		await ask(app, 'Late question?');
		await expect(
			run(app, 'set_task_stage_status', { task: 'SHOP-1', stage: 'dev', status: 'done' })
		).resolves.toMatchObject({ stages: { dev: 'done' } });
		await expect(
			run(app, 'move_task', { task: 'SHOP-1', stage: 'dev', status: 'in_progress' })
		).resolves.toBeDefined();
		await expect(
			run(app, 'set_task_stage_status', { task: 'SHOP-1', stage: 'dev', status: 'todo' })
		).resolves.toBeDefined();
		await expect(start(app, 'SHOP-2')).rejects.toMatchObject({ status: 409 });
	});

	it('blocks over MCP and reports the message as a tool error', async () => {
		const app = setup();
		await ask(app, 'Which?');
		const reply = (await handleMcp(
			app,
			{
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: {
					name: 'set_task_stage_status',
					arguments: { task: 'SHOP-1', stage: 'dev', status: 'in_progress' }
				}
			},
			'claude'
		)) as McpReply;
		expect(reply.result.isError).toBe(true);
		expect(reply.result.content[0].text).toContain('has 1 open question');
		const init = (await handleMcp(
			app,
			{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
			'x'
		)) as McpReply;
		expect(init.result.instructions).toContain('add_epic_questions');
	});

	it('is removed with the epic', async () => {
		const app = setup();
		await ask(app, 'Which?');
		app.epics.delete('SHOP-E1', 'test');
		expect(app.db.prepare('SELECT COUNT(*) AS n FROM epic_questions').get()).toEqual({ n: 0 });
	});

	it('logs who asked, edited, answered, ignored, reopened and deleted', async () => {
		const app = setup();
		const [a, b] = await ask(app, 'Which?', 'Why?');
		await run(app, 'update_question', { question: a.id, context: 'More' }, 'nick');
		await run(app, 'answer_question', { question: a.id, answer: 'x' }, 'nick');
		await run(app, 'ignore_question', { question: b.id }, 'nick');
		await run(app, 'reopen_question', { question: b.id }, 'nick');
		await run(app, 'delete_question', { question: b.id }, 'nick');
		const entries = app.activity
			.forEpic('SHOP-E1')
			.items.filter((i) => i.action.startsWith('question.'))
			.map((i) => [i.action, i.actor, i.message])
			.sort((x, y) => x[0].localeCompare(y[0]));
		expect(entries).toEqual([
			['question.added', 'claude', 'Asked 2 questions on SHOP-E1: \u201cWhich?\u201d +1 more'],
			['question.answered', 'nick', 'Answered \u201cWhich?\u201d: x'],
			['question.deleted', 'nick', 'Deleted \u201cWhy?\u201d'],
			['question.ignored', 'nick', 'Ignored \u201cWhy?\u201d'],
			['question.reopened', 'nick', 'Reopened \u201cWhy?\u201d'],
			['question.updated', 'nick', 'Edited \u201cWhich?\u201d']
		]);
	});
});

describe('project order', () => {
	const run = (app: ReturnType<typeof testApp>['app'], name: string, input: object) =>
		execute(app, operationsByName.get(name)!, input, { actor: 'dashboard' }) as Promise<
			Record<string, unknown>
		>;
	const keys = async (app: ReturnType<typeof testApp>['app']) =>
		((await run(app, 'list_projects', {})) as unknown as { key: string }[]).map((p) => p.key);
	function setup() {
		const { app } = testApp();
		for (const key of ['AAA', 'BBB', 'CCC', 'DDD']) app.projects.create({ key, name: key }, 'test');
		return app;
	}

	it('puts new projects last', async () => {
		const app = setup();
		expect(await keys(app)).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
		app.projects.create({ key: 'ABB', name: 'Abb' }, 'test');
		expect(await keys(app)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'ABB']);
	});

	it('moves a project before another one, by key or id, and reflects it in list_projects', async () => {
		const app = setup();
		await run(app, 'move_project', { project: 'DDD', beforeProject: 'BBB' });
		expect(await keys(app)).toEqual(['AAA', 'DDD', 'BBB', 'CCC']);
		await run(app, 'move_project', { project: 'AAA', beforeProject: app.projects.get('CCC').id });
		expect(await keys(app)).toEqual(['DDD', 'BBB', 'AAA', 'CCC']);
		expect(await run(app, 'move_project', { project: 'bbb', beforeProject: 'DDD' })).toMatchObject({
			key: 'BBB',
			position: 0
		});
	});

	it('moves a project last with null or no target', async () => {
		const app = setup();
		await run(app, 'move_project', { project: 'AAA', beforeProject: null });
		expect(await keys(app)).toEqual(['BBB', 'CCC', 'DDD', 'AAA']);
		await run(app, 'move_project', { project: 'BBB' });
		expect(await keys(app)).toEqual(['CCC', 'DDD', 'AAA', 'BBB']);
	});

	it('leaves the order alone when moving before itself', async () => {
		const app = setup();
		await run(app, 'move_project', { project: 'BBB', beforeProject: 'BBB' });
		expect(await keys(app)).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
	});

	it('rejects unknown projects and targets', async () => {
		const app = setup();
		await expect(run(app, 'move_project', { project: 'NOPE' })).rejects.toMatchObject({
			status: 404
		});
		await expect(
			run(app, 'move_project', { project: 'AAA', beforeProject: 'NOPE' })
		).rejects.toMatchObject({ status: 404 });
		expect(await keys(app)).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
	});

	it('does not log a reorder and keeps order valid after a delete', async () => {
		const app = setup();
		const totals = () =>
			['AAA', 'BBB', 'CCC', 'DDD'].map((key) => app.activity.forProject(key).total);
		const before = totals();
		await run(app, 'move_project', { project: 'DDD', beforeProject: 'AAA' });
		expect(totals()).toEqual(before);
		await run(app, 'delete_project', { project: 'AAA' });
		await run(app, 'move_project', { project: 'CCC', beforeProject: 'DDD' });
		expect(await keys(app)).toEqual(['CCC', 'DDD', 'BBB']);
	});
});

describe('task comments', () => {
	const setup = () => {
		const { app } = testApp();
		app.projects.create({ key: 'shop', name: 'Shop' }, 'test');
		app.epics.create('SHOP', { title: 'Checkout', tasks: [{ title: 'One' }] }, 'test');
		return app;
	};
	type App = ReturnType<typeof setup>;
	const run = (app: App, name: string, input: object, actor = 'dashboard') =>
		execute(app, operationsByName.get(name)!, input, { actor }) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

	it('adds a comment over REST with 201 and shows it in get_task and list_tasks', async () => {
		const app = setup();
		expect(operationsByName.get('add_task_comment')).toMatchObject({
			method: 'POST',
			path: '/tasks/{task}/comments',
			successStatus: 201
		});
		const comment = await run(app, 'add_task_comment', { task: 'SHOP-1', body: 'Looks **good**' });
		expect(comment).toMatchObject({
			author: 'dashboard',
			authorKind: 'human',
			body: 'Looks **good**'
		});

		const task = await run(app, 'get_task', { task: 'SHOP-1' });
		expect(task.comments).toHaveLength(1);
		expect(task.commentCount).toBe(1);
		const [listed] = await run(app, 'list_tasks', { epic: 'SHOP-E1' });
		expect(listed.commentCount).toBe(1);
		expect(listed.comments).toBeUndefined();
		expect(await run(app, 'list_task_comments', { task: 'SHOP-1' })).toHaveLength(1);

		await expect(run(app, 'add_task_comment', { task: 'SHOP-1', body: ' ' })).rejects.toThrow();
		await expect(run(app, 'add_task_comment', { task: 'SHOP-9', body: 'x' })).rejects.toMatchObject(
			{ status: 404 }
		);
	});

	it('lets agents change only their own comments and the person only theirs', async () => {
		const app = setup();
		const comment = await run(app, 'add_task_comment', { task: 'SHOP-1', body: 'a' }, 'claude');
		await expect(
			run(app, 'update_task_comment', { comment: comment.id, body: 'b' }, 'codex')
		).rejects.toMatchObject({ status: 403 });
		await expect(
			run(app, 'delete_task_comment', { comment: comment.id }, 'dashboard')
		).rejects.toMatchObject({ status: 403 });
		const human = await run(app, 'add_task_comment', { task: 'SHOP-1', body: 'h' });
		await expect(
			run(app, 'delete_task_comment', { comment: human.id }, 'claude')
		).rejects.toMatchObject({ status: 403 });
		const edited = await run(
			app,
			'update_task_comment',
			{ comment: comment.id, body: 'b' },
			'claude'
		);
		expect(edited.body).toBe('b');
		expect(await run(app, 'delete_task_comment', { comment: comment.id }, 'claude')).toEqual({
			deleted: true
		});
		expect(await run(app, 'delete_task_comment', { comment: human.id })).toEqual({ deleted: true });
	});

	it('comments over MCP', async () => {
		const app = setup();
		const reply = (await handleMcp(
			app,
			{
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name: 'add_task_comment', arguments: { task: 'SHOP-1', body: 'Blocked on API' } }
			},
			'claude'
		)) as McpReply;
		expect(reply.result.structuredContent).toMatchObject({
			author: 'claude',
			body: 'Blocked on API'
		});
		expect(app.comments.list('SHOP-1')).toHaveLength(1);
		const init = (await handleMcp(
			app,
			{ jsonrpc: '2.0', id: 2, method: 'initialize', params: {} },
			'claude'
		)) as McpReply;
		expect(init.result.instructions).toContain('add_task_comment');
	});
});
