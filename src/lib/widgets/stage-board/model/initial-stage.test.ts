import { describe, expect, it } from 'vitest';
import type { Progress } from '#lib/shared/domain/types.ts';
import { initialStage } from './initial-stage.ts';

const progress = (dev: [number, number], test: [number, number], deploy: [number, number]) => {
	const counts = ([done, total]: [number, number]) => ({ done, total });
	return { stages: { dev: counts(dev), test: counts(test), deploy: counts(deploy) } } as Progress;
};

describe('initialStage', () => {
	it('opens dev when the epic has no tasks', () => {
		expect(initialStage(progress([0, 0], [0, 0], [0, 0]))).toBe('dev');
	});
	it('opens dev when dev is partly done', () => {
		expect(initialStage(progress([1, 3], [0, 3], [0, 3]))).toBe('dev');
	});
	it('opens test when dev is done', () => {
		expect(initialStage(progress([3, 3], [0, 3], [0, 3]))).toBe('test');
	});
	it('opens deploy when dev and test are done', () => {
		expect(initialStage(progress([3, 3], [3, 3], [1, 3]))).toBe('deploy');
	});
	it('opens deploy when everything is done', () => {
		expect(initialStage(progress([3, 3], [3, 3], [3, 3]))).toBe('deploy');
	});
});
