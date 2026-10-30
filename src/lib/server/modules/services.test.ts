import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { ConflictError, InvalidInputError, NotFoundError } from '../core/errors.ts';
import { testApp } from '../testing/app.ts';

function withEpic() {
	const ctx = testApp();
	ctx.app.projects.create({ key: 'pma', name: 'PM' }, 'test');
	const epic = ctx.app.epics.create(
		'PMA',
		{
			title: 'Launch',
			tasks: [{ title: 'API', specs: [{ title: 'API spec', content: '# API' }] }, { title: 'UI' }],
			specs: [{ title: 'Epic spec', content: 'Hello' }]
		},
		'agent'
	);
	return { ...ctx, epic };
}

describe('activity paging', () => {
	it('pages newest first with a stable order and a total', () => {
		const { app } = withEpic();
		for (let i = 0; i < 12; i++) app.tasks.create('PMA-E1', { title: `T${i}` }, 'test');
		const first = app.activity.forEpic('PMA-E1');
		expect(first.items).toHaveLength(10);
		const second = app.activity.forEpic('PMA-E1', { limit: 10, offset: 10 });
		expect(second.total).toBe(first.total);
		expect(second.items.length).toBe(first.total - 10);
		const ids = [...first.items, ...second.items].map((a) => a.id);
		expect(new Set(ids).size).toBe(first.total);
		const times = [...first.items, ...second.items].map((a) => a.createdAt);
		expect(times).toEqual([...times].sort().reverse());
		expect(app.activity.forEpic('PMA-E1', { limit: 500 }).items.length).toBe(first.total);
		expect(app.activity.forEpic('PMA-E1', { offset: 1000 }).items).toEqual([]);
	});
});

describe('projects', () => {
	it('normalizes keys and rejects duplicates', () => {
		const { app } = testApp();
		expect(app.projects.create({ key: 'shop', name: 'Shop' }, 'test').key).toBe('SHOP');
		expect(() => app.projects.create({ key: 'SHOP', name: 'Other' }, 'test')).toThrow(
			ConflictError
		);
		expect(() => app.projects.create({ key: '1', name: '' }, 'test')).toThrow(ZodError);
	});

	it('finds a project by id or key', () => {
		const { app } = testApp();
		const project = app.projects.create({ key: 'SHOP', name: 'Shop' }, 'test');
		expect(app.projects.get('shop').id).toBe(project.id);
		expect(() => app.projects.get('nope')).toThrow(NotFoundError);
	});
});

describe('epics', () => {
	it('creates the whole plan in one call with sequential keys', () => {
		const { epic } = withEpic();
		expect(epic.key).toBe('PMA-E1');
		expect(epic.tasks.map((t) => t.key)).toEqual(['PMA-1', 'PMA-2']);
		expect(epic.specs.map((s) => [s.title, s.taskId === null])).toEqual([
			['Epic spec', true],
			['API spec', false]
		]);
	});

	it('rolls back everything when part of the plan is invalid', () => {
		const { app } = testApp();
		app.projects.create({ key: 'PMA', name: 'PM' }, 'test');
		expect(() =>
			app.epics.create(
				'PMA',
				{ title: 'Bad', tasks: [{ title: 'Fine' }, { title: 'X', priority: 'nope' as never }] },
				'test'
			)
		).toThrow(ZodError);
		expect(app.epics.list('PMA')).toHaveLength(0);
	});
});

describe('tasks', () => {
	it('moves a stage, logs it, and ignores no-op moves', () => {
		const { app } = withEpic();
		app.tasks.setStage('PMA-1', { stage: 'test', status: 'done', note: 'All green' }, 'ci-bot');
		app.tasks.setStage('PMA-1', { stage: 'test', status: 'done' }, 'ci-bot');
		const moves = app.activity
			.forTask('PMA-1')
			.items.filter((a) => a.action === 'task.stage_changed');
		expect(moves).toHaveLength(1);
		expect(moves[0]).toMatchObject({
			actor: 'ci-bot',
			message: 'Moved PMA-1 to Tests · Done',
			data: { note: 'All green' }
		});
	});

	it('filters a board column', () => {
		const { app, epic } = withEpic();
		app.tasks.setStage('PMA-2', { stage: 'dev', status: 'done' }, 'test');
		expect(app.tasks.list(epic.key, { stage: 'dev', status: 'done' }).map((t) => t.key)).toEqual([
			'PMA-2'
		]);
	});
});

describe('specs', () => {
	it('keeps fields that a partial update leaves out', () => {
		const { app, epic } = withEpic();
		const spec = epic.specs.find((s) => s.title === 'Epic spec')!;
		expect(app.specs.update(spec.id, { title: 'Renamed' }, 'test').content).toBe('Hello');
		app.projects.update('PMA', { description: 'Kept' }, 'test');
		expect(app.projects.update('PMA', { name: 'Renamed' }, 'test').description).toBe('Kept');
		app.epics.update(epic.id, { summary: 'Kept' }, 'test');
		expect(app.epics.update(epic.id, { title: 'T' }, 'test').summary).toBe('Kept');
	});

	it('writes a human brief and clears it when the content changes', async () => {
		const { app, epic } = withEpic();
		const specId = epic.specs.find((s) => s.title === 'Epic spec')!.id;
		const translated = await app.specs.translate(specId, 'test');
		expect(translated.brief?.source).toBe('heuristic');
		expect(app.specs.update(specId, { title: 'Renamed' }, 'test').brief).not.toBeNull();
		expect(app.specs.update(specId, { content: 'Changed' }, 'test').brief).toBeNull();
	});
});

describe('moving tasks on the board', () => {
	const order = (app: ReturnType<typeof testApp>['app'], epicKey: string) =>
		app.tasks.list(epicKey).map((t) => t.key);

	it('reorders within the epic', () => {
		const { app, epic } = withEpic();
		app.tasks.create(epic.key, { title: 'Docs' }, 'test');
		expect(order(app, epic.key)).toEqual(['PMA-1', 'PMA-2', 'PMA-3']);
		app.tasks.move('PMA-3', { beforeTask: 'PMA-1' }, 'test');
		expect(order(app, epic.key)).toEqual(['PMA-3', 'PMA-1', 'PMA-2']);
		app.tasks.move('PMA-3', { beforeTask: null }, 'test');
		expect(order(app, epic.key)).toEqual(['PMA-1', 'PMA-2', 'PMA-3']);
		expect(app.activity.forEpic(epic.key).items.some((a) => a.action === 'task.updated')).toBe(
			false
		);
	});

	const positions = (app: ReturnType<typeof testApp>['app'], epicKey: string) =>
		app.tasks.list(epicKey).map((t) => t.position);

	it('appends new tasks and moves a task up, down and to the end with dense positions', () => {
		const { app, epic } = withEpic();
		app.tasks.create(epic.key, { title: 'Docs' }, 'test');
		app.tasks.create(epic.key, { title: 'More' }, 'test');
		expect(order(app, epic.key)).toEqual(['PMA-1', 'PMA-2', 'PMA-3', 'PMA-4']);
		app.tasks.move('PMA-4', { beforeTask: 'PMA-2' }, 'test');
		expect(order(app, epic.key)).toEqual(['PMA-1', 'PMA-4', 'PMA-2', 'PMA-3']);
		app.tasks.move('PMA-1', { beforeTask: 'PMA-3' }, 'test');
		expect(order(app, epic.key)).toEqual(['PMA-4', 'PMA-2', 'PMA-1', 'PMA-3']);
		app.tasks.move('PMA-4', { beforeTask: null }, 'test');
		expect(order(app, epic.key)).toEqual(['PMA-2', 'PMA-1', 'PMA-3', 'PMA-4']);
		expect(positions(app, epic.key)).toEqual([0, 1, 2, 3]);
	});

	it('keeps the position when only the status changes', () => {
		const { app, epic } = withEpic();
		app.tasks.create(epic.key, { title: 'Docs' }, 'test');
		const before = positions(app, epic.key);
		app.tasks.move('PMA-1', { stage: 'dev', status: 'done' }, 'test');
		app.tasks.setStage('PMA-3', { stage: 'test', status: 'in_progress' }, 'test');
		expect(order(app, epic.key)).toEqual(['PMA-1', 'PMA-2', 'PMA-3']);
		expect(positions(app, epic.key)).toEqual(before);
	});

	it('changes column and position in one step', () => {
		const { app, epic } = withEpic();
		const moved = app.tasks.move(
			'PMA-2',
			{ stage: 'test', status: 'in_progress', beforeTask: 'PMA-1' },
			'agent'
		);
		expect(moved.stages.test).toBe('in_progress');
		expect(order(app, epic.key)).toEqual(['PMA-2', 'PMA-1']);
		expect(app.activity.forTask('PMA-2').items[0].message).toBe(
			'Moved PMA-2 to Tests · In progress'
		);
	});

	it('rejects a half stage change and a task from another epic', () => {
		const { app } = withEpic();
		expect(() => app.tasks.move('PMA-1', { stage: 'dev' }, 'test')).toThrow(InvalidInputError);
		const other = app.epics.create('PMA', { title: 'Other', tasks: [{ title: 'Y' }] }, 'test');
		expect(() => app.tasks.move('PMA-1', { beforeTask: other.tasks[0].key }, 'test')).toThrow(
			InvalidInputError
		);
	});
});

describe('moving tasks between epics', () => {
	it('preserves completed stages and specs, recomputes both epics', () => {
		const { app, epic } = withEpic();
		app.tasks.update('PMA-1', { stages: { dev: 'done', test: 'done', deploy: 'done' } }, 'test');
		const target = app.epics.create('PMA', { title: 'Destination' }, 'test');
		const moved = app.tasks.move('PMA-1', { epic: target.id, beforeTask: null }, 'test');
		expect(moved).toMatchObject({
			epicId: target.id,
			key: 'PMA-1',
			stages: { dev: 'done', test: 'done', deploy: 'done' }
		});
		expect(app.tasks.detail(moved.id).specs).toHaveLength(1);
		expect(app.epics.detail(epic.id).specs.every((s) => s.taskId !== moved.id)).toBe(true);
		expect(app.epics.detail(epic.id).progress.status).toBe('todo');
		expect(app.epics.detail(target.id).progress).toMatchObject({ status: 'done', percent: 100 });
		app.tasks.move('PMA-2', { epic: target.id, beforeTask: moved.id }, 'test');
		expect(app.tasks.list(target.id).map((t) => t.key)).toEqual(['PMA-2', 'PMA-1']);
		expect(app.epics.detail(target.id).progress.status).toBe('in_progress');
		expect(app.epics.detail(epic.id).tasks).toHaveLength(0);
	});
	it('compacts the source epic and inserts at the drop point in the target', () => {
		const { app, epic } = withEpic();
		app.tasks.create(epic.key, { title: 'Docs' }, 'test');
		const target = app.epics.create('PMA', { title: 'Destination' }, 'test');
		app.tasks.create(target.key, { title: 'A' }, 'test');
		app.tasks.create(target.key, { title: 'B' }, 'test');
		const [a, b] = app.tasks.list(target.key);
		app.tasks.move('PMA-1', { epic: target.id, beforeTask: b.key }, 'test');
		expect(app.tasks.list(target.key).map((t) => [t.key, t.position])).toEqual([
			[a.key, 0],
			['PMA-1', 1],
			[b.key, 2]
		]);
		expect(app.tasks.list(epic.key).map((t) => [t.key, t.position])).toEqual([
			['PMA-2', 0],
			['PMA-3', 1]
		]);
	});
	it('rejects other projects and invalid insertion targets without changing the task', () => {
		const { app, epic } = withEpic();
		app.projects.create({ key: 'OTHER', name: 'Other' }, 'test');
		const elsewhere = app.epics.create('OTHER', { title: 'Other' }, 'test');
		expect(() => app.tasks.move('PMA-1', { epic: elsewhere.id }, 'test')).toThrow(
			InvalidInputError
		);
		const target = app.epics.create('PMA', { title: 'Target' }, 'test');
		expect(() => app.tasks.move('PMA-1', { epic: target.id, beforeTask: 'PMA-2' }, 'test')).toThrow(
			InvalidInputError
		);
		expect(app.tasks.get('PMA-1')).toMatchObject({ epicId: epic.id });
	});
});
