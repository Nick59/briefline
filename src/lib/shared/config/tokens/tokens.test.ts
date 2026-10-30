import { describe, expect, it } from 'vitest';
import { taskTintTone } from './index.ts';
import type { StageStatuses } from '#lib/shared/domain/types.ts';

const stages = (dev: string, test: string, deploy: string) =>
	({ dev, test, deploy }) as StageStatuses;

describe('taskTintTone', () => {
	it('does not tint a task that has not started', () => {
		expect(taskTintTone(stages('todo', 'todo', 'todo'))).toBeNull();
	});

	it('uses the in-progress tone while dev is the current stage', () => {
		expect(taskTintTone(stages('in_progress', 'todo', 'todo'))).toBe('status-in-progress');
	});

	it('uses the stage tone once dev is done', () => {
		expect(taskTintTone(stages('done', 'in_progress', 'todo'))).toBe('stage-test');
		expect(taskTintTone(stages('done', 'done', 'todo'))).toBe('stage-deploy');
	});

	it('uses the done tone when every stage is done', () => {
		expect(taskTintTone(stages('done', 'done', 'done'))).toBe('status-done');
	});
});
