import { describe, expect, it } from 'vitest';
import type { WorkStatus } from '#lib/shared/domain/constants.ts';
import type { Task } from '#lib/shared/domain/types.ts';
import { applyDrop, planDrop } from './drop.ts';

const task = (id: string, position: number, dev: WorkStatus): Task =>
	({ id, position, stages: { dev, test: 'todo', deploy: 'todo' } }) as Task;

// Epic order: a(todo) b(done) c(todo) d(done) e(todo)
const tasks = [
	task('a', 0, 'todo'),
	task('b', 1, 'done'),
	task('c', 2, 'todo'),
	task('d', 3, 'done'),
	task('e', 4, 'todo')
];

describe('planDrop', () => {
	it('only changes the status when the column changes', () => {
		expect(planDrop(tasks, 'a', 'dev', 'done', 'd')).toEqual({
			status: 'done',
			beforeTask: undefined
		});
	});

	it('reorders before the card it is dropped on', () => {
		expect(planDrop(tasks, 'e', 'dev', 'todo', 'a')).toEqual({ status: null, beforeTask: 'a' });
		expect(planDrop(tasks, 'a', 'dev', 'todo', 'e')).toEqual({ status: null, beforeTask: 'e' });
	});

	it('drops at the column end right after the last card of the column', () => {
		expect(planDrop(tasks, 'a', 'dev', 'todo', null)).toEqual({ status: null, beforeTask: null });
		expect(planDrop(tasks, 'b', 'dev', 'done', null)).toEqual({ status: null, beforeTask: 'e' });
		expect(planDrop(tasks, 'e', 'dev', 'todo', null)).toBeNull();
	});

	it('ignores drops that leave the visible order unchanged', () => {
		expect(planDrop(tasks, 'a', 'dev', 'todo', 'c')).toBeNull();
		expect(planDrop(tasks, 'a', 'dev', 'todo', 'a')).toBeNull();
		expect(planDrop(tasks, 'x', 'dev', 'todo', null)).toBeNull();
	});
});

describe('applyDrop', () => {
	const ids = (list: Task[]) => list.map((t) => t.id);

	it('keeps the slot of a card that changes column', () => {
		const next = applyDrop(tasks, 'c', 'dev', { status: 'done', beforeTask: undefined });
		expect(ids(next)).toEqual(['a', 'b', 'c', 'd', 'e']);
		expect(next[2].stages.dev).toBe('done');
	});

	it('sorts by position even when the input is shuffled', () => {
		const next = applyDrop(tasks.toReversed(), 'c', 'dev', {
			status: 'done',
			beforeTask: undefined
		});
		expect(ids(next)).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('reorders before a card or last', () => {
		expect(ids(applyDrop(tasks, 'e', 'dev', { status: null, beforeTask: 'b' }))).toEqual([
			'a',
			'e',
			'b',
			'c',
			'd'
		]);
		expect(ids(applyDrop(tasks, 'a', 'dev', { status: null, beforeTask: null }))).toEqual([
			'b',
			'c',
			'd',
			'e',
			'a'
		]);
	});
});
