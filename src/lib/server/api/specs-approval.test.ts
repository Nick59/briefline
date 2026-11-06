import { describe, expect, it } from 'vitest';
import { testApp } from '../testing/app.ts';
import { handleMcp } from '../mcp/handler.ts';
import { execute } from './execute.ts';
import { operationsByName } from './operations.ts';
import { matchRoute } from './router.ts';

function setup() {
	const { app } = testApp();
	app.projects.create({ key: 'SHOP', name: 'Shop' }, 'test');
	const epic = app.epics.create(
		'SHOP',
		{
			title: 'Checkout',
			tasks: [{ title: 'API' }, { title: 'UI' }],
			specs: [{ title: 'Plan', content: 'Original' }]
		},
		'test'
	);
	const run = (name: string, input: object) =>
		execute(app, operationsByName.get(name)!, input, { actor: 'Nick' });
	return { app, epic, run };
}

const blocked = { status: 409, body: { error: { code: 'specs_not_approved' } } };

describe('epic spec approval', () => {
	it('reports specsRequired only when the epic has specs', () => {
		const { app } = testApp();
		app.projects.create({ key: 'SHOP', name: 'Shop' }, 'test');
		const epic = app.epics.create('SHOP', { title: 'Empty' }, 'test');
		expect(app.epics.detail(epic.id).specsRequired).toBe(false);
		expect(app.epics.list('SHOP')[0].specsRequired).toBe(false);
		app.specs.createForEpic(epic.id, { title: 'Plan', content: 'x' }, 'test');
		expect(app.epics.detail(epic.id).specsRequired).toBe(true);
		expect(app.epics.list('SHOP')[0].specsRequired).toBe(true);
	});

	it('blocks all start paths and records approval in epic and task responses', async () => {
		const { app, run } = setup();
		expect(app.epics.list('SHOP')[0].specsApprovedAt).toBeNull();
		for (const [name, input] of [
			['set_task_stage_status', { task: 'SHOP-1', stage: 'dev', status: 'in_progress' }],
			['set_task_stage_status', { task: 'SHOP-1', stage: 'test', status: 'done' }],
			['update_task', { task: 'SHOP-1', stages: { deploy: 'in_progress' } }],
			['move_task', { task: 'SHOP-1', stage: 'dev', status: 'done' }]
		] as const)
			await expect(run(name, input)).rejects.toMatchObject(blocked);
		expect(app.tasks.get('SHOP-1').stages).toEqual({ dev: 'todo', test: 'todo', deploy: 'todo' });
		expect(app.tasks.list('SHOP-E1')).toHaveLength(2);
		const approved = await run('approve_epic_specs', { epic: 'shop-e1' });
		expect(approved).toMatchObject({
			specsApprovedAt: expect.any(String),
			specsApprovedBy: 'Nick'
		});
		expect(await run('approve_epic_specs', { epic: 'SHOP-E1' })).toEqual(approved);
		expect(
			app.activity
				.forEpic('SHOP-E1')
				.items.filter((a) => a.message === 'Approved specs of epic SHOP-E1')
		).toHaveLength(1);
		expect(app.tasks.detail('SHOP-1').epic).toMatchObject({
			specsApprovedAt: expect.any(String),
			specsApprovedBy: 'Nick'
		});
		await expect(
			run('set_task_stage_status', { task: 'SHOP-1', stage: 'dev', status: 'in_progress' })
		).resolves.toMatchObject({ stages: { dev: 'in_progress' } });
		const [q] = app.questions.add('SHOP-E1', { questions: [{ question: 'Which?' }] }, 'test');
		await expect(
			run('set_task_stage_status', { task: 'SHOP-2', stage: 'dev', status: 'in_progress' })
		).rejects.toMatchObject({ status: 409, body: { error: { code: 'open_questions' } } });
		app.questions.ignore(q.id, 'Nick');
		await expect(
			run('set_task_stage_status', { task: 'SHOP-2', stage: 'dev', status: 'done' })
		).resolves.toBeDefined();
		expect(matchRoute('POST', '/epics/SHOP-E1/specs/approve')).toMatchObject({
			op: { name: 'approve_epic_specs' }
		});
	});

	it('creates tasks and epics with started stages without approval', async () => {
		const { app, run } = setup();
		await expect(
			run('create_task', { epic: 'SHOP-E1', title: 'Imported', stages: { dev: 'in_progress' } })
		).resolves.toMatchObject({ stages: { dev: 'in_progress' } });
		await expect(
			run('create_epic', {
				project: 'SHOP',
				title: 'Imported epic',
				tasks: [{ title: 'X', stages: { dev: 'in_progress' } }]
			})
		).resolves.toBeDefined();
		expect(app.epics.list('SHOP')).toHaveLength(2);
	});

	it('requires approval only when the epic has epic or task specs', async () => {
		const { app, run } = setup();
		const start = (task: string) =>
			run('set_task_stage_status', { task, stage: 'dev', status: 'in_progress' });
		const bare = app.epics.create('SHOP', { title: 'Bare', tasks: [{ title: 'T' }] }, 'test');
		const [bareTask] = app.tasks.list(bare.id);
		await expect(start(bareTask.id)).resolves.toMatchObject({ stages: { dev: 'in_progress' } });
		const other = app.epics.create('SHOP', { title: 'Task spec', tasks: [{ title: 'U' }] }, 'test');
		const [otherTask] = app.tasks.list(other.id);
		app.specs.createForTask(otherTask.id, { title: 'Detail' }, 'test');
		await expect(start(otherTask.id)).rejects.toMatchObject(blocked);
		const [q] = app.questions.add(bare.id, { questions: [{ question: 'Which?' }] }, 'test');
		await expect(
			run('set_task_stage_status', { task: bareTask.id, stage: 'test', status: 'in_progress' })
		).rejects.toMatchObject({ status: 409, body: { error: { code: 'open_questions' } } });
		app.questions.ignore(q.id, 'Nick');
	});

	it('keeps approval after epic or task specs are added, changed or deleted', async () => {
		const { app, epic, run } = setup();
		await run('approve_epic_specs', { epic: epic.id });
		const approved = app.epics.get(epic.id);
		expect(approved.specsApprovedAt).not.toBeNull();
		const kept = () =>
			expect(app.epics.get(epic.id)).toMatchObject({
				specsApprovedAt: approved.specsApprovedAt,
				specsApprovedBy: 'Nick'
			});
		app.specs.update(epic.specs[0].id, { content: 'Changed' }, 'test');
		kept();
		const taskSpec = app.specs.createForTask('SHOP-1', { title: 'Detail' }, 'test');
		kept();
		app.specs.update(taskSpec.id, { title: 'New detail' }, 'test');
		kept();
		app.specs.delete(taskSpec.id, 'test');
		kept();
		app.specs.delete(epic.specs[0].id, 'test');
		kept();
		await expect(
			run('set_task_stage_status', { task: 'SHOP-2', stage: 'dev', status: 'in_progress' })
		).resolves.toBeDefined();
	});

	it('returns a useful MCP tool error and exposes approval status and instructions', async () => {
		const { app } = setup();
		const call = (method: string, params: object) =>
			handleMcp(app, { jsonrpc: '2.0', id: 1, method, params }, 'claude');
		const result = await call('tools/call', {
			name: 'set_task_stage_status',
			arguments: { task: 'SHOP-1', stage: 'dev', status: 'in_progress' }
		});
		expect(result).toMatchObject({
			result: {
				isError: true,
				content: [{ text: expect.stringContaining('specs are not approved') }]
			}
		});
		expect(
			await call('tools/call', { name: 'get_epic', arguments: { epic: 'SHOP-E1' } })
		).toMatchObject({
			result: { content: [{ text: expect.stringContaining('"specsApprovedAt": null') }] }
		});
		expect(await call('initialize', {})).toMatchObject({
			result: { instructions: expect.stringContaining('specs_not_approved') }
		});
	});
});
