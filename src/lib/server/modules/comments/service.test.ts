import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../core/events.ts';
import { connectProject, testApp } from '../../testing/app.ts';

function setup() {
	const ctx = testApp({ GITHUB_TOKEN: 't' });
	const { app } = ctx;
	app.projects.create({ key: 'shop', name: 'Shop' }, 'test');
	app.epics.create(
		'SHOP',
		{ title: 'Checkout', tasks: [{ title: 'One' }, { title: 'Two' }] },
		'test'
	);
	const events: DomainEvent[] = [];
	app.events.subscribe((event) => events.push(event));
	return { ...ctx, events };
}

describe('task comments', () => {
	it('lists comments oldest first and counts them on task lists', () => {
		const { app } = setup();
		const first = app.comments.add('SHOP-1', { body: 'first' }, 'nick');
		const second = app.comments.add('shop-1', { body: 'second **bold**' }, 'claude');
		expect(app.comments.list('SHOP-1').map((c) => c.id)).toEqual([first.id, second.id]);
		expect(second).toMatchObject({ taskId: app.tasks.get('SHOP-1').id, author: 'claude' });

		const counts = app.tasks.list('SHOP-E1').map((t) => [t.key, t.commentCount]);
		expect(counts).toEqual([
			['SHOP-1', 2],
			['SHOP-2', 0]
		]);
		expect(app.tasks.get('SHOP-1').commentCount).toBe(2);
		expect(app.tasks.detail('SHOP-1').comments.map((c) => c.body)).toEqual([
			'first',
			'second **bold**'
		]);
		expect(app.epics.detail('SHOP-E1').tasks.map((t) => t.commentCount)).toEqual([2, 0]);
	});

	it('rejects an empty comment and an unknown task', () => {
		const { app } = setup();
		expect(() => app.comments.add('SHOP-1', { body: '   ' }, 'nick')).toThrow();
		expect(() => app.comments.add('SHOP-99', { body: 'x' }, 'nick')).toThrow(/not found/);
	});

	it('lets an agent change only its own comments', () => {
		const { app } = setup();
		const comment = app.comments.add('SHOP-1', { body: 'mine' }, 'claude');
		expect(comment.authorKind).toBe('agent');
		expect(() => app.comments.update(comment.id, { body: 'hijack' }, 'codex')).toThrow(
			expect.objectContaining({ status: 403, code: 'forbidden' })
		);
		expect(() => app.comments.delete(comment.id, 'codex')).toThrow(
			expect.objectContaining({ status: 403 })
		);
		const edited = app.comments.update(comment.id, { body: 'edited' }, 'claude');
		expect(edited.body).toBe('edited');
		expect(edited.createdAt).toBe(comment.createdAt);
		expect(app.comments.list('SHOP-1')[0].body).toBe('edited');
		app.comments.delete(comment.id, 'claude');
		expect(app.comments.list('SHOP-1')).toEqual([]);
		expect(() => app.comments.delete(comment.id, 'claude')).toThrow(/not found/);
	});

	it('keeps a person comment editable by the person after a profile rename', () => {
		const { app } = setup();
		app.profile.update({ name: 'Nick', role: 'developer', codingLevel: 'expert' });
		const comment = app.comments.add('SHOP-1', { body: 'mine' }, 'Nick');
		const viaDashboard = app.comments.add('SHOP-1', { body: 'other' }, 'dashboard');
		expect([comment.authorKind, viaDashboard.authorKind]).toEqual(['human', 'human']);

		app.profile.update({ name: 'Nicolas', role: 'developer', codingLevel: 'expert' });
		expect(app.comments.update(comment.id, { body: 'edited' }, 'Nicolas').body).toBe('edited');
		app.comments.delete(comment.id, 'Nicolas');
		app.comments.delete(viaDashboard.id, 'dashboard');
		expect(app.comments.list('SHOP-1')).toEqual([]);
	});

	it('keeps person and agent comments apart', () => {
		const { app } = setup();
		const person = app.comments.add('SHOP-1', { body: 'p' }, 'dashboard');
		const agent = app.comments.add('SHOP-1', { body: 'a' }, 'claude');
		expect(() => app.comments.update(person.id, { body: 'x' }, 'claude')).toThrow(
			expect.objectContaining({
				status: 403,
				message: "Only the person can edit a person's comment"
			})
		);
		expect(() => app.comments.delete(person.id, 'claude')).toThrow(
			expect.objectContaining({ status: 403 })
		);
		expect(() => app.comments.update(agent.id, { body: 'x' }, 'dashboard')).toThrow(
			expect.objectContaining({ status: 403 })
		);
		expect(() => app.comments.delete(agent.id, 'dashboard')).toThrow(
			expect.objectContaining({ status: 403 })
		);
	});

	it('removes comments with their task', () => {
		const { app } = setup();
		const comment = app.comments.add('SHOP-1', { body: 'x' }, 'nick');
		app.tasks.delete('SHOP-1', 'nick');
		expect(app.db.prepare('SELECT id FROM task_comments WHERE id = ?').all(comment.id)).toEqual([]);
	});

	it('emits events linked to the task and logs readable activity', () => {
		const { app, events } = setup();
		const comment = app.comments.add('SHOP-1', { body: 'x'.repeat(600) }, 'nick');
		app.comments.update(comment.id, { body: 'short' }, 'nick');
		app.comments.delete(comment.id, 'nick');
		const task = app.tasks.get('SHOP-1');
		const relevant = events.filter((e) => e.type.startsWith('task.comment'));
		expect(relevant.map((e) => e.type)).toEqual([
			'task.commented',
			'task.comment_updated',
			'task.comment_deleted'
		]);
		expect(relevant[0]).toMatchObject({ taskId: task.id, epicId: task.epicId, actor: 'nick' });
		expect((relevant[0].data as { body: string }).body).toHaveLength(500);
		expect(relevant[0].data).toMatchObject({ key: 'SHOP-1', title: 'One', commentId: comment.id });

		const messages = app.activity.forProject('SHOP').items.map((i) => i.message);
		expect(messages).toEqual(
			expect.arrayContaining([
				'Commented on SHOP-1 “One”',
				'Edited a comment on SHOP-1 “One”',
				'Deleted a comment on SHOP-1 “One”'
			])
		);
		expect(app.activity.forProject('SHOP').items[0].target).toMatchObject({ taskKey: 'SHOP-1' });
	});

	it('does not mirror task comments onto an epic ticket', async () => {
		const { app, calls } = setup();
		connectProject(app, 'SHOP', 'github', { repo: 'acme/shop' });
		const epic = app.epics.get('SHOP-E1');
		app.epics.update(epic.id, { externalRef: { provider: 'github', key: '#42' } }, 'test');
		await app.ticketing.idle();
		calls.length = 0;
		const jobs = app.ticketing.jobs({ epicId: epic.id }).length;

		const comment = app.comments.add('SHOP-1', { body: 'note' }, 'claude');
		app.comments.update(comment.id, { body: 'note 2' }, 'claude');
		app.comments.delete(comment.id, 'claude');
		await app.ticketing.idle();

		expect(calls).toEqual([]);
		expect(app.ticketing.jobs({ epicId: epic.id })).toHaveLength(jobs);
	});
});
