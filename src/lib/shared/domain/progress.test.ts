import { describe, expect, it } from 'vitest';
import {
	computeProgress,
	epicDisplayStage,
	taskCurrentStage,
	taskOverallStatus
} from './progress.ts';
import type { StageStatuses } from './types.ts';

const task = (dev: string, test: string, deploy: string) => ({
	stages: { dev, test, deploy } as StageStatuses
});

describe('computeProgress', () => {
	it('is empty and todo without tasks', () => {
		const progress = computeProgress([]);
		expect(progress).toMatchObject({ percent: 0, status: 'todo', currentStage: null });
	});

	it('counts in-progress work as half done', () => {
		const progress = computeProgress([
			task('done', 'in_progress', 'todo'),
			task('todo', 'todo', 'todo')
		]);
		expect(progress.stages.dev).toMatchObject({ done: 1, todo: 1, total: 2, percent: 50 });
		expect(progress.stages.test.percent).toBe(25);
		expect(progress.percent).toBe(25);
		expect(progress.status).toBe('in_progress');
		expect(progress.currentStage).toBe('dev');
	});

	it('is done only when every task is deployed', () => {
		expect(computeProgress([task('done', 'done', 'done')])).toMatchObject({
			percent: 100,
			status: 'done',
			currentStage: null
		});
		expect(
			computeProgress([task('done', 'done', 'done'), task('done', 'done', 'in_progress')]).status
		).toBe('in_progress');
	});
});

describe('task status', () => {
	it('derives the overall status and current stage', () => {
		expect(taskOverallStatus({ dev: 'todo', test: 'todo', deploy: 'todo' })).toBe('todo');
		expect(taskOverallStatus({ dev: 'done', test: 'todo', deploy: 'todo' })).toBe('in_progress');
		expect(taskCurrentStage({ dev: 'done', test: 'in_progress', deploy: 'todo' })).toBe('test');
		expect(taskCurrentStage({ dev: 'done', test: 'done', deploy: 'done' })).toBeNull();
	});
});

describe('epicDisplayStage', () => {
	it('returns the stage only for in-progress epics past dev', () => {
		expect(epicDisplayStage({ status: 'in_progress', currentStage: 'test' })).toBe('test');
		expect(epicDisplayStage({ status: 'in_progress', currentStage: 'deploy' })).toBe('deploy');
		expect(epicDisplayStage({ status: 'in_progress', currentStage: 'dev' })).toBeNull();
		expect(epicDisplayStage({ status: 'todo', currentStage: 'test' })).toBeNull();
		expect(epicDisplayStage({ status: 'done', currentStage: null })).toBeNull();
	});
});
