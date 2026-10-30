import { describe, expect, it } from 'vitest';
import { testApp } from '../../testing/app.ts';

function seeded() {
	const { app } = testApp();
	app.projects.create({ key: 'shop', name: 'Shop' }, 't');
	app.epics.create(
		'SHOP',
		{
			title: 'Checkout',
			externalRef: { provider: 'plane', key: 'SOFT1-E', url: 'https://plane.test/e' },
			tasks: [
				{
					title: 'Linked',
					externalRef: { provider: 'plane', key: 'SOFT1-693', url: 'https://plane.test/693' }
				},
				{ title: 'Plain' }
			]
		},
		't'
	);
	return app;
}

describe('activity list', () => {
	it('returns the linked ticket and rewrites messages with its key', () => {
		const app = seeded();
		app.tasks.setStage('SHOP-1', { stage: 'dev', status: 'in_progress' }, 't');
		const items = app.activity.forTask('SHOP-1').items;
		expect(items[0].ticket).toEqual({
			provider: 'plane',
			key: 'SOFT1-693',
			url: 'https://plane.test/693'
		});
		expect(items[0].message).toContain('SOFT1-693');
		expect(items[0].message).not.toContain('SHOP-1 ');
	});

	it('keeps the internal key for unlinked tasks and uses the epic ref for epic events', () => {
		const app = seeded();
		app.tasks.update('SHOP-2', { title: 'Plainer' }, 't');
		const items = app.activity.forProject('SHOP').items;
		const plain = items.find((i) => i.action === 'task.updated')!;
		expect(plain.ticket).toBeUndefined();
		expect(plain.message).toContain('SHOP-2');
		const epic = items.find((i) => i.action === 'epic.created')!;
		expect(epic.ticket?.key).toBe('SOFT1-E');
		expect(epic.message).toContain('SOFT1-E');
		expect(epic.message).not.toContain('SHOP-E1');
	});

	it('keeps the message after the task is deleted', () => {
		const app = seeded();
		app.tasks.delete('SHOP-1', 't');
		const deleted = app.activity.forProject('SHOP').items.find((i) => i.action === 'task.deleted')!;
		expect(deleted.ticket).toBeUndefined();
		expect(deleted.message).toContain('SHOP-1');
	});
});
