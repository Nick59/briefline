import { describe, expect, it } from 'vitest';
import { testApp } from '../testing/app.ts';
import { readActivityPage } from './activity-page.ts';

function seeded() {
	const { app } = testApp();
	const a = app.projects.create({ key: 'AAA', name: 'Alpha' }, 'dashboard');
	app.projects.create({ key: 'BBB', name: 'Beta' }, 'claude');
	const epic = app.epics.create('AAA', { title: 'Epic A' }, 'codex');
	for (let i = 0; i < 12; i++) app.epics.create('BBB', { title: `B${i}` }, 'claude');
	return { app, a, epic };
}

const read = (app: ReturnType<typeof seeded>['app'], query: string) =>
	readActivityPage(app, new URLSearchParams(query));

describe('readActivityPage', () => {
	it('pages through everything', () => {
		const { app } = seeded();
		const first = read(app, '');
		expect(first).toMatchObject({ page: 1, pageSize: 10 });
		expect(first.items).toHaveLength(10);
		const second = read(app, 'page=2');
		expect(second.page).toBe(2);
		expect(second.total).toBe(first.total);
		const ids = new Set([...first.items, ...second.items].map((i) => i.id));
		expect(ids.size).toBe(first.items.length + second.items.length);
	});

	it('scopes to a project and an epic', () => {
		const { app, a, epic } = seeded();
		const project = read(app, `project=${a.id}`);
		expect(project.items.every((i) => i.projectId === a.id)).toBe(true);
		const scoped = read(app, `epic=${epic.id}`);
		expect(scoped.items.length).toBeGreaterThan(0);
		expect(scoped.items.every((i) => i.epicId === epic.id)).toBe(true);
	});

	it('clamps a page past the end', () => {
		const { app } = seeded();
		const result = read(app, 'page=99&size=5');
		expect(result.page).toBe(result.pageCount);
		expect(result.items.length).toBeGreaterThan(0);
	});

	it('rejects bad input and unknown scopes', () => {
		const { app } = seeded();
		expect(() => read(app, 'page=0')).toThrow(/.+/);
		expect(() => read(app, 'size=1000')).toThrow(/.+/);
		expect(() => read(app, 'who=robots')).toThrow(/.+/);
		expect(() => read(app, 'project=NOPE')).toThrow(/not found|NOPE/i);
	});
});
