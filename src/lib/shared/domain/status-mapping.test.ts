import { describe, expect, it } from 'vitest';
import { computeProgress } from './progress.ts';
import {
	defaultState,
	mappingKeyForEpic,
	mappingKeyForTask,
	suggestMapping
} from './status-mapping.ts';
import type { StageStatuses, TicketingState } from './types.ts';

const stages = (dev: string, test: string, deploy: string) =>
	({ dev, test, deploy }) as StageStatuses;

describe('mappingKeyForTask', () => {
	it('is not_started when nothing has begun', () => {
		expect(mappingKeyForTask(stages('todo', 'todo', 'todo'))).toBe('not_started');
	});

	it('follows the current stage while work is in progress', () => {
		expect(mappingKeyForTask(stages('in_progress', 'todo', 'todo'))).toBe('dev');
		expect(mappingKeyForTask(stages('done', 'todo', 'todo'))).toBe('test');
		expect(mappingKeyForTask(stages('done', 'in_progress', 'todo'))).toBe('test');
		expect(mappingKeyForTask(stages('done', 'done', 'in_progress'))).toBe('deploy');
	});

	it('is done only when every stage is done', () => {
		expect(mappingKeyForTask(stages('done', 'done', 'done'))).toBe('done');
	});
});

describe('mappingKeyForEpic', () => {
	const task = (...s: [string, string, string]) => ({ stages: stages(...s) });

	it('is not_started for an empty epic or untouched tasks', () => {
		expect(mappingKeyForEpic(computeProgress([]))).toBe('not_started');
		expect(mappingKeyForEpic(computeProgress([task('todo', 'todo', 'todo')]))).toBe('not_started');
	});

	it('uses the current stage of the epic', () => {
		const progress = computeProgress([
			task('done', 'done', 'done'),
			task('done', 'in_progress', 'todo')
		]);
		expect(mappingKeyForEpic(progress)).toBe('test');
	});

	it('is done when every task is deployed', () => {
		expect(mappingKeyForEpic(computeProgress([task('done', 'done', 'done')]))).toBe('done');
	});
});

describe('suggestMapping', () => {
	const states: TicketingState[] = [
		{ id: 'b', name: 'Backlog', group: 'backlog' },
		{ id: 'u', name: 'Todo', group: 'unstarted' },
		{ id: 's1', name: 'In Progress', group: 'started' },
		{ id: 's2', name: 'In Review', group: 'started' },
		{ id: 'c', name: 'Done', group: 'completed' },
		{ id: 'x', name: 'Cancelled', group: 'cancelled' }
	];

	it('proposes backlog, started and completed states', () => {
		expect(suggestMapping(states)).toEqual({
			not_started: { id: 'b', name: 'Backlog' },
			dev: { id: 's1', name: 'In Progress' },
			test: { id: 's1', name: 'In Progress' },
			deploy: { id: 's1', name: 'In Progress' },
			done: { id: 'c', name: 'Done' }
		});
	});

	it('falls back to unstarted when there is no backlog', () => {
		expect(suggestMapping(states.slice(1)).not_started?.id).toBe('u');
	});

	it('leaves rows out when no state matches', () => {
		expect(suggestMapping([{ id: 'x', name: 'Only', group: 'cancelled' }])).toEqual({});
		expect(suggestMapping([])).toEqual({});
	});
});

describe('defaultState', () => {
	it('prefers unstarted over backlog, like the providers', () => {
		const states: TicketingState[] = [
			{ id: 'b', name: 'Backlog', group: 'backlog' },
			{ id: 'u', name: 'Todo', group: 'unstarted' }
		];
		expect(defaultState('not_started', states)?.id).toBe('u');
		expect(defaultState('done', states)).toBeUndefined();
	});
});
