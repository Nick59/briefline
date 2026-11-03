import { describe, expect, it } from 'vitest';
import { execute } from '../../api/execute.ts';
import { operationsByName } from '../../api/operations.ts';
import { testApp } from '../../testing/app.ts';

type Changes = {
	items: { cursor: string; action: string; actor: string; message: string }[];
	cursor: string;
	hasMore: boolean;
};

function setup() {
	const { app } = testApp();
	const run = (name: string, input: object = {}, actor = 'dashboard') =>
		execute(app, operationsByName.get(name)!, input, { actor }) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
	const changes = (input: object = {}, actor = 'claude') =>
		run('get_activity_changes', input, actor) as Promise<Changes>;
	app.projects.create({ key: 'AA', name: 'Alpha' }, 'seed');
	app.projects.create({ key: 'BB', name: 'Beta' }, 'seed');
	return { app, run, changes };
}

describe('get_activity_changes', () => {
	it('returns the latest entries oldest first when nothing is stored, then only new ones', async () => {
		const { app, changes } = setup();
		const first = await changes();
		expect(first.items.map((i) => i.action)).toEqual(['project.created', 'project.created']);
		expect(first.hasMore).toBe(false);
		expect(first.cursor).toBe(first.items[1].cursor);
		expect((await changes()).items).toEqual([]);

		app.epics.create('AA', { title: 'New epic' }, 'dashboard');
		const second = await changes();
		expect(second.items.map((i) => i.action)).toEqual(['epic.created']);
		expect(second.cursor).toBe(second.items[0].cursor);
	});

	it('keeps the input cursor when nothing changed, and the head when the log is empty', async () => {
		const { changes } = setup();
		const first = await changes();
		expect((await changes()).cursor).toBe(first.cursor);

		const empty = testApp().app;
		const result = empty.activity.changes({ excludeOwn: true, limit: 5 }, 'claude');
		expect(result).toEqual({ items: [], cursor: 'act_0', hasMore: false, gap: false });
	});

	it('uses an explicit since and stores the result', async () => {
		const { app, changes } = setup();
		const all = await changes({}, 'someone');
		app.epics.create('AA', { title: 'E1' }, 'dashboard');
		app.epics.create('AA', { title: 'E2' }, 'dashboard');
		const since = await changes({ since: all.items[0].cursor }, 'claude');
		expect(since.items.map((i) => i.action)).toEqual([
			'project.created',
			'epic.created',
			'epic.created'
		]);
		expect((await changes({}, 'claude')).items).toEqual([]);
		await expect(changes({ since: 'nope' })).rejects.toMatchObject({ status: 400 });
	});

	it('keeps separate cursors per actor and per scope', async () => {
		const { app, changes } = setup();
		await changes({}, 'a');
		await changes({ project: 'AA' }, 'a');
		app.epics.create('AA', { title: 'E1' }, 'dashboard');
		app.epics.create('BB', { title: 'E2' }, 'dashboard');

		expect((await changes({}, 'b')).items).toHaveLength(4);
		expect((await changes({ project: 'AA' }, 'a')).items).toHaveLength(1);
		expect((await changes({}, 'a')).items).toHaveLength(2);
		expect((await changes({ project: 'BB' }, 'a')).items.map((i) => i.action)).toEqual([
			'project.created',
			'epic.created'
		]);
		expect((await changes({ project: 'AA' }, 'a')).items).toEqual([]);
	});

	it('filters by epic', async () => {
		const { app, changes } = setup();
		const e1 = app.epics.create('AA', { title: 'E1' }, 'dashboard');
		app.epics.create('AA', { title: 'E2' }, 'dashboard');
		const result = await changes({ epic: e1.key });
		expect(result.items).toHaveLength(1);
		expect(result.items[0].message).toContain('E1');
	});

	it('excludes the own entries by default and keeps them with excludeOwn false', async () => {
		const { app, changes } = setup();
		app.epics.create('AA', { title: 'Mine' }, 'claude');
		app.epics.create('AA', { title: 'Theirs' }, 'nick');
		const others = await changes({ since: 'act_0' });
		expect(others.items.map((i) => i.actor)).toEqual(['seed', 'seed', 'nick']);
		const everything = await changes({ since: 'act_0', excludeOwn: false });
		expect(everything.items).toHaveLength(4);
		expect((await changes({ since: 'act_0', excludeOwn: 'false' })).items).toHaveLength(4);
	});

	it('pages with limit and hasMore', async () => {
		const { app, changes } = setup();
		for (let n = 0; n < 5; n++) app.epics.create('AA', { title: `E${n}` }, 'nick');
		const first = await changes({ since: 'act_0', limit: 3 });
		expect(first.items).toHaveLength(3);
		expect(first.hasMore).toBe(true);
		const second = await changes({ limit: 3 });
		expect(second.items).toHaveLength(3);
		expect(second.hasMore).toBe(true);
		const third = await changes({ limit: 3 });
		expect(third.items).toHaveLength(1);
		expect(third.hasMore).toBe(false);
		const newest = await changes({ limit: 2 }, 'fresh');
		expect(newest.items.map((i) => i.message)).toEqual([
			expect.stringContaining('E3'),
			expect.stringContaining('E4')
		]);
	});

	it('stores nothing and keeps returning the latest entries without an actor', async () => {
		const { app, run } = setup();
		const call = () => run('get_activity_changes', {}, 'api') as Promise<Changes>;
		expect((await call()).items).toHaveLength(2);
		expect((await call()).items).toHaveLength(2);
		expect(app.db.prepare('SELECT COUNT(*) AS n FROM activity_cursors').get()).toEqual({ n: 0 });
		const mcp = (await run('get_activity_changes', {}, 'mcp')) as Changes;
		expect(mcp.items).toHaveLength(2);
	});

	it('keeps sequence numbers rising after the newest entries are deleted', async () => {
		const { app, changes } = setup();
		const before = await changes();
		app.projects.delete('BB');
		app.projects.create({ key: 'CC', name: 'Gamma' }, 'nick');
		const after = await changes({ since: before.cursor });
		expect(after.items.map((i) => i.message)).toEqual(['Created project Gamma']);
	});

	it('reports dashboard changes to an agent and ignores marking a spec viewed', async () => {
		const { app, run, changes } = setup();
		const epic = app.epics.create('AA', { title: 'Epic', tasks: [{ title: 'Task' }] }, 'seed');
		const spec = app.specs.createForEpic(epic.key, { title: 'Plan', content: 'one' }, 'seed');
		app.epics.approveSpecs(epic.key, 'dashboard');
		const [question] = await run(
			'add_epic_questions',
			{ epic: epic.key, questions: [{ question: 'Which?' }] },
			'claude'
		);
		await changes();

		const task = app.tasks.list(epic.key)[0];
		await run('update_question', { question: question.id, answer: 'This' });
		await run('update_question', { question: question.id, status: 'ignored' });
		await run('update_question', { question: question.id, status: 'open' });
		await run('update_question', { question: question.id, answer: 'Again' });
		await run('reply_to_question', { question: question.id, body: 'Detail' });
		await run('create_task', { epic: epic.key, title: 'Another' });
		await run('update_task', { task: task.key, title: 'Renamed', description: 'Text' });
		await run('set_task_stage_status', { task: task.key, stage: 'dev', status: 'in_progress' });
		await run('add_epic_questions', { epic: epic.key, questions: [{ question: 'More?' }] });
		await run('add_spec', { epic: epic.key, title: 'Second', content: 'x' });
		await run('update_spec', { spec: spec.id, content: 'two' });
		await run('set_spec_brief', {
			spec: spec.id,
			brief: {
				summary: 's',
				whyItMatters: '',
				whatChanges: [],
				acceptance: [],
				risks: [],
				openQuestions: [],
				glossary: [],
				effort: 'S',
				readingMinutes: 1
			}
		});

		const seen = await changes();
		expect(new Set(seen.items.map((i) => i.actor))).toEqual(new Set(['dashboard']));
		expect(new Set(seen.items.map((i) => i.action))).toEqual(
			new Set([
				'question.answered',
				'question.ignored',
				'question.reopened',
				'question.added',
				'question.replied',
				'task.created',
				'task.updated',
				'task.stage_changed',
				'spec.created',
				'spec.updated',
				'spec.translated'
			])
		);

		app.specs.markViewed(spec.id);
		expect((await changes()).items).toEqual([]);
	});
});
