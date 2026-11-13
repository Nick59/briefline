import { describe, expect, it } from 'vitest';
import { testApp } from '../../testing/app.ts';

function setup() {
	const { app } = testApp();
	const list = async (input: Parameters<typeof app.activity.list>[0] = {}) =>
		app.activity.list(input);
	app.projects.create({ key: 'AA', name: 'Alpha' }, 'dashboard');
	app.projects.create({ key: 'BB', name: 'Beta' }, 'claude');
	app.epics.create('AA', { title: 'One' }, 'codex');
	app.epics.create('BB', { title: 'Two' }, 'claude');
	app.epics.create('BB', { title: 'Three' }, 'dashboard');
	return { app, list };
}

describe('activity list', () => {
	it('lists everything newest first and pages with limit and offset', async () => {
		const { list } = setup();
		const all = await list();
		expect(all.total).toBe(5);
		expect(all.items[0].message).toContain('Three');

		const page = await list({ limit: 2, offset: 2 });
		expect(page.items).toHaveLength(2);
		expect(page.items[0].message).toBe(all.items[2].message);
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
