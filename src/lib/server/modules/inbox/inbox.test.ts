import { describe, expect, it } from 'vitest';
import { execute } from '../../api/execute.ts';
import { operationsByName } from '../../api/operations.ts';
import { testApp } from '../../testing/app.ts';

function setup() {
	const { app } = testApp();
	const run = (name: string, input: object = {}, actor = 'dashboard') =>
		execute(app, operationsByName.get(name)!, input, { actor }) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
	app.projects.create({ key: 'AA', name: 'Alpha' }, 'seed');
	const epic = app.epics.create('AA', { title: 'Epic' }, 'claude');
	const actions = (item: { changes: { action: string }[] }) => item.changes.map((c) => c.action);
	return { app, run, epic, actions };
}

describe('inbox', () => {
	it('shows an agent the changes of others, never its own, and shows only new changes after an ack', async () => {
		const { app, run, epic, actions } = setup();
		const mine = await run('create_task', { epic: epic.key, title: 'Mine' });
		await run('add_task_comment', { task: mine.key, body: 'Please look' });
		await run('set_task_stage_status', { task: mine.key, stage: 'dev', status: 'in_progress' });
		const other = await run('create_task', { epic: epic.key, title: 'Agent task' }, 'claude');
		await run('add_task_comment', { task: other.key, body: 'Done' }, 'claude');

		const inbox = await run('get_inbox', {}, 'claude');
		expect(inbox).toHaveLength(1);
		expect(inbox[0]).toMatchObject({
			kind: 'task',
			key: mine.key,
			title: 'Mine',
			epicKey: epic.key,
			projectKey: 'AA',
			assignee: null,
			ackedBy: []
		});
		expect(actions(inbox[0])).toEqual(['task.created', 'task.commented', 'task.stage_changed']);
		expect(await run('get_inbox', { project: 'AA' }, 'claude')).toHaveLength(1);
		expect(app.inbox.count('claude')).toBe(1);

		expect(await run('ack_inbox', { items: [mine.key] }, 'claude')).toEqual({
			acknowledged: [mine.key]
		});
		expect(await run('ack_inbox', { items: [mine.key] }, 'claude')).toEqual({ acknowledged: [] });
		expect(await run('get_inbox', {}, 'claude')).toEqual([]);
		expect(app.inbox.count('claude')).toBe(0);

		await run('add_task_comment', { task: mine.key, body: 'Again' });
		expect(app.inbox.count('claude')).toBe(1);
		expect(actions((await run('get_inbox', {}, 'claude'))[0])).toEqual(['task.commented']);
	});

	it('keeps an acknowledgement per agent and reports who is up to date', async () => {
		const { run, epic, actions } = setup();
		const task = await run('create_task', { epic: epic.key, title: 'T' });
		expect(await run('get_inbox', {}, 'a')).toHaveLength(1);
		expect(await run('get_inbox', {}, 'b')).toHaveLength(1);

		await run('ack_inbox', { items: [task.key] }, 'a');
		expect(await run('get_inbox', {}, 'a')).toEqual([]);
		const [seenByB] = await run('get_inbox', {}, 'b');
		expect(seenByB.ackedBy).toEqual([{ agent: 'a', ackedAt: expect.any(String), upToDate: true }]);

		await run('add_task_comment', { task: task.key, body: 'New' });
		const [seenByA] = await run('get_inbox', {}, 'a');
		expect(actions(seenByA)).toEqual(['task.commented']);
		const [seenByB2] = await run('get_inbox', {}, 'b');
		expect(actions(seenByB2)).toEqual(['task.created', 'task.commented']);
		expect(seenByB2.ackedBy[0].upToDate).toBe(false);
	});

	it('does not acknowledge a change newer than the seq the agent saw', async () => {
		const { run, epic, actions } = setup();
		const task = await run('create_task', { epic: epic.key, title: 'T' });
		const [seen] = await run('get_inbox', {}, 'a');
		await run('add_task_comment', { task: task.key, body: 'Arrived in between' });

		expect(await run('ack_inbox', { items: [{ item: task.key, seq: seen.seq }] }, 'a')).toEqual({
			acknowledged: [task.key]
		});
		const [rest] = await run('get_inbox', {}, 'a');
		expect(actions(rest)).toEqual(['task.commented']);
		expect(await run('ack_inbox', { items: [{ item: task.key, seq: seen.seq }] }, 'a')).toEqual({
			acknowledged: []
		});
	});

	it('repeats and interleaves acknowledgements safely', async () => {
		const { run, epic } = setup();
		const task = await run('create_task', { epic: epic.key, title: 'T' });
		const results = await Promise.all(
			['a', 'b', 'a', 'b'].map((agent) => run('ack_inbox', { items: [task.key] }, agent))
		);
		expect(results.map((r) => r.acknowledged.length)).toEqual([1, 1, 0, 0]);
		expect(await run('get_inbox', {}, 'a')).toEqual([]);
		expect(await run('get_inbox', {}, 'b')).toEqual([]);
	});

	it('flags an epic for the others of whoever opens a thread', async () => {
		const { app, run, epic, actions } = setup();
		await run(
			'add_epic_questions',
			{ epic: epic.key, questions: [{ question: 'Which?' }] },
			'claude'
		);
		expect(await run('get_inbox', {}, 'claude')).toEqual([]);
		expect(app.inbox.list('dashboard')).toHaveLength(1);

		await run('add_epic_questions', { epic: epic.key, questions: [{ question: 'Why?' }] });
		const [item] = await run('get_inbox', {}, 'claude');
		expect(item).toMatchObject({
			kind: 'epic',
			key: epic.key,
			epicKey: epic.key,
			projectKey: 'AA'
		});
		expect(item).not.toHaveProperty('assignee');
		expect(actions(item)).toEqual(['question.added']);
		expect(item.changes[0].message).toContain('Added thread');

		expect(await run('ack_inbox', { items: [epic.key] }, 'claude')).toEqual({
			acknowledged: [epic.key]
		});
		expect(await run('get_inbox', {}, 'claude')).toEqual([]);
	});

	it('acknowledges several items at once and nothing when one key is unknown', async () => {
		const { run, epic } = setup();
		const task = await run('create_task', { epic: epic.key, title: 'T' });
		await run('add_epic_questions', { epic: epic.key, questions: [{ question: 'Why?' }] });
		expect(await run('get_inbox', {}, 'a')).toHaveLength(2);

		await expect(run('ack_inbox', { items: [task.key, 'AA-99'] }, 'a')).rejects.toMatchObject({
			status: 404
		});
		expect(await run('get_inbox', {}, 'a')).toHaveLength(2);

		expect(await run('ack_inbox', { items: [task.key, epic.key] }, 'a')).toEqual({
			acknowledged: [task.key, epic.key]
		});
		expect(await run('get_inbox', {}, 'a')).toEqual([]);
	});

	it('keeps the first flag time, scopes by project and drops deleted tasks', async () => {
		const { app, run, epic } = setup();
		app.projects.create({ key: 'BB', name: 'Beta' }, 'seed');
		const task = await run('create_task', { epic: epic.key, title: 'T' });
		const first = (await run('get_inbox', {}, 'a'))[0].flaggedAt;
		await run('add_task_comment', { task: task.key, body: 'x' });
		const [item] = await run('get_inbox', {}, 'a');
		expect(item.flaggedAt).toBe(first);
		expect(item.changes).toHaveLength(2);
		expect(await run('get_inbox', { project: 'BB' }, 'a')).toEqual([]);

		await run('delete_task', { task: task.key });
		expect(await run('get_inbox', {}, 'a')).toEqual([]);
		expect(app.inbox.count('a')).toBe(0);
	});

	it('shows a person the changes of agents, never their own', async () => {
		const { app, run, epic, actions } = setup();
		const task = await run('create_task', { epic: epic.key, title: 'T' });
		expect(app.inbox.list('dashboard')).toEqual([]);
		expect(app.inbox.count('dashboard')).toBe(0);

		await run('add_task_comment', { task: task.key, body: 'From A' }, 'a');
		const seen = app.inbox.list('dashboard');
		expect(seen).toHaveLength(1);
		expect(actions(seen[0])).toEqual(['task.commented']);
		expect(app.inbox.count('dashboard')).toBe(1);
		expect(actions((await run('get_inbox', {}, 'b'))[0])).toEqual([
			'task.created',
			'task.commented'
		]);
		expect(actions((await run('get_inbox', {}, 'a'))[0])).toEqual(['task.created']);
	});

	it('does not count an item whose new changes are all the viewer own', async () => {
		const { app, run, epic } = setup();
		const task = await run('create_task', { epic: epic.key, title: 'T' }, 'a');
		await run('add_task_comment', { task: task.key, body: 'Mine' }, 'a');
		expect(await run('get_inbox', {}, 'a')).toEqual([]);
		expect(app.inbox.count('a')).toBe(0);
		expect(app.inbox.list('dashboard')).toHaveLength(1);

		await run('add_task_comment', { task: task.key, body: 'Mine too' });
		expect(app.inbox.list('dashboard')).toHaveLength(1);
		app.inbox.markSeen([task.key]);
		await run('add_task_comment', { task: task.key, body: 'Person own' });
		expect(app.inbox.list('dashboard')).toEqual([]);
		expect(app.inbox.count('dashboard')).toBe(0);
		expect(app.inbox.count('a')).toBe(1);
	});

	it('marks seen for the person only', async () => {
		const { app, run, epic } = setup();
		const task = await run('create_task', { epic: epic.key, title: 'T' }, 'a');
		expect(await run('mark_inbox_seen', { items: [task.key] })).toEqual({
			acknowledged: [task.key]
		});
		expect(app.inbox.count('dashboard')).toBe(0);
		expect(await run('get_inbox', {}, 'b')).toHaveLength(1);

		await run('add_task_comment', { task: task.key, body: 'More' }, 'b');
		expect(app.inbox.count('dashboard')).toBe(1);
	});

	it('shows an item again to an agent when another agent changes it after its ack', async () => {
		const { run, epic, actions } = setup();
		const task = await run('create_task', { epic: epic.key, title: 'T' });
		await run('ack_inbox', { items: [task.key] }, 'a');
		expect(await run('get_inbox', {}, 'a')).toEqual([]);
		await run('add_task_comment', { task: task.key, body: 'From B' }, 'b');
		expect(actions((await run('get_inbox', {}, 'a'))[0])).toEqual(['task.commented']);
	});

	it('refuses acknowledgements under a person name', async () => {
		const { run, epic } = setup();
		const task = await run('create_task', { epic: epic.key, title: 'T' }, 'a');
		await expect(run('ack_inbox', { items: [task.key] })).rejects.toMatchObject({ status: 400 });
	});
});
