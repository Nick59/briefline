import { describe, expect, it } from 'vitest';
import { testApp } from '../../testing/app.ts';
import { escapeLike } from './service.ts';

function seeded() {
	const { app } = testApp();
	app.projects.create({ key: 'shop', name: 'Shop' }, 't');
	app.projects.create({ key: 'ops', name: 'Operations' }, 't');
	app.epics.create(
		'SHOP',
		{
			title: 'Checkout',
			tasks: [
				{ title: 'Cart page' },
				{ title: 'Payment form', externalRef: { provider: 'plane', key: 'SOFT1-693', url: null } },
				{ title: 'Discount 100% off', externalRef: { provider: 'github', key: '#123', url: null } },
				{ title: 'Under_score' }
			]
		},
		't'
	);
	return app;
}

describe('find tickets', () => {
	it('resolves a task key case-insensitively and trimmed', () => {
		const [hit] = seeded().search.find('  shop-2 ');
		expect(hit).toMatchObject({
			kind: 'task',
			key: 'SHOP-2',
			exact: true,
			path: '/projects/SHOP/epics/SHOP-E1/tasks/SHOP-2'
		});
	});

	it('resolves an epic key and a project key', () => {
		const app = seeded();
		expect(app.search.find('shop-e1')[0]).toMatchObject({
			kind: 'epic',
			exact: true,
			path: '/projects/SHOP/epics/SHOP-E1'
		});
		expect(app.search.find('Shop')[0]).toMatchObject({
			kind: 'project',
			exact: true,
			path: '/projects/SHOP'
		});
	});

	it('resolves a linked external key, with or without the hash', () => {
		const app = seeded();
		expect(app.search.find('soft1-693')[0]).toMatchObject({
			key: 'SHOP-2',
			externalKey: 'SOFT1-693',
			exact: true
		});
		expect(app.search.find('#123')[0]).toMatchObject({ key: 'SHOP-3', exact: true });
		expect(app.search.find('123')[0]).toMatchObject({ key: 'SHOP-3', exact: true });
	});

	it('searches titles and key prefixes, exact matches first', () => {
		const app = seeded();
		expect(app.search.find('payment').map((h) => h.key)).toEqual(['SHOP-2']);
		expect(app.search.find('payment')[0].exact).toBe(false);
		const keys = app.search.find('SHOP-1').map((h) => h.key);
		expect(keys[0]).toBe('SHOP-1');
		expect(app.search.find('nothing-here')).toEqual([]);
	});

	it('treats LIKE wildcards literally', () => {
		const app = seeded();
		expect(escapeLike('50%_\\')).toBe('50\\%\\_\\\\');
		expect(app.search.find('%')).toEqual([expect.objectContaining({ key: 'SHOP-3' })]);
		expect(app.search.find('_')).toEqual([expect.objectContaining({ key: 'SHOP-4' })]);
		expect(app.search.find('c_rt')).toEqual([]);
	});

	it('limits the number of hits', () => {
		const app = seeded();
		expect(app.search.find('SHOP-', 2)).toHaveLength(2);
		expect(app.search.find('SHOP-')).toHaveLength(4);
	});
});
