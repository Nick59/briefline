import { describe, expect, it } from 'vitest';
import { execute } from '../../api/execute.ts';
import { operationsByName } from '../../api/operations.ts';
import { testApp } from '../../testing/app.ts';

type Listed = {
	items: { actor: string; message: string; projectId: string }[];
	total: number;
	limit: number;
	offset: number;
	hasMore: boolean;
	nextOffset: number | null;
};

function setup() {
	const { app } = testApp();
	const list = (input: object = {}) =>
		execute(app, operationsByName.get('list_activity')!, input, {
			actor: 'dashboard'
		}) as Promise<Listed>;
	app.projects.create({ key: 'AA', name: 'Alpha' }, 'dashboard');
	app.projects.create({ key: 'BB', name: 'Beta' }, 'claude');
	app.epics.create('AA', { title: 'One' }, 'codex');
	app.epics.create('BB', { title: 'Two' }, 'claude');
	app.epics.create('BB', { title: 'Three' }, 'dashboard');
	return { app, list };
}

describe('list_activity', () => {
	it('lists everything newest first with paging details', async () => {
		const { list } = setup();
		const all = await list();
		expect(all.total).toBe(5);
		expect(all.limit).toBe(50);
		expect(all.items[0].message).toContain('Three');
		expect(all.hasMore).toBe(false);

		expect((await list({ limit: 200 })).limit).toBe(200);
		const page = await list({ limit: 2, offset: 2 });
		expect(page.items).toHaveLength(2);
		expect(page.items[0].message).toBe(all.items[2].message);
		expect(page.hasMore).toBe(true);
		expect(page.nextOffset).toBe(4);
	});

	it('filters by project, actor and who', async () => {
		const { app, list } = setup();
		expect((await list({ project: 'BB' })).total).toBe(3);
		expect((await list({ actor: 'claude' })).total).toBe(2);
		expect((await list({ who: 'people' })).items.map((i) => i.actor)).toEqual([
			'dashboard',
			'dashboard'
		]);
		expect((await list({ who: 'agents' })).total).toBe(3);
		expect((await list({ project: 'BB', who: 'agents' })).total).toBe(2);

		app.profile.update({ name: 'Ada', role: 'developer', codingLevel: 'expert' });
		app.epics.create('AA', { title: 'Four' }, 'Ada');
		expect((await list({ who: 'people' })).total).toBe(3);
		expect((await list({ who: 'agents' })).total).toBe(3);
		await expect(list({ project: 'NOPE' })).rejects.toMatchObject({ status: 404 });
	});

	it('lists the distinct actors', () => {
		const { app } = setup();
		expect(app.activity.actors()).toEqual(['claude', 'codex', 'dashboard']);
	});
});
