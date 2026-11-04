import { MAPPING_KEYS, type MappingKey, type Stage, type WorkStatus } from './constants.ts';
import { taskCurrentStage, taskOverallStatus } from './progress.ts';
import type { Progress, StageStatuses, StatusMapping, TicketingState } from './types.ts';

export function mappingKeyFor(status: WorkStatus, stage: Stage | null): MappingKey {
	if (status === 'todo') return 'not_started';
	if (status === 'done') return 'done';
	return stage ?? 'dev';
}

export function mappingKeyForTask(stages: StageStatuses): MappingKey {
	return mappingKeyFor(taskOverallStatus(stages), taskCurrentStage(stages));
}

export function mappingKeyForEpic(progress: Pick<Progress, 'status' | 'currentStage'>): MappingKey {
	return mappingKeyFor(progress.status, progress.currentStage);
}

/** Reads a remote ticket state back as a Briefline mapping key; null means leave the task where it is. */
export function mappingKeyFromState(
	state: { id: string; group?: string },
	mapping: StatusMapping,
	current: MappingKey
): MappingKey | null {
	const matches = MAPPING_KEYS.filter((key) => mapping[key]?.id === state.id);
	if (matches.length) return matches.includes(current) ? current : matches[0];
	if (state.group === 'completed') return 'done';
	if (state.group === 'unstarted' || state.group === 'backlog') return 'not_started';
	return current === 'done' ? 'dev' : null;
}

export function stagesFor(key: MappingKey): StageStatuses {
	switch (key) {
		case 'not_started':
			return { dev: 'todo', test: 'todo', deploy: 'todo' };
		case 'dev':
			return { dev: 'in_progress', test: 'todo', deploy: 'todo' };
		case 'test':
			return { dev: 'done', test: 'in_progress', deploy: 'todo' };
		case 'deploy':
			return { dev: 'done', test: 'done', deploy: 'in_progress' };
		case 'done':
			return { dev: 'done', test: 'done', deploy: 'done' };
	}
}

export type StateGroup = 'backlog' | 'unstarted' | 'started' | 'completed';

function pick(states: TicketingState[], groups: StateGroup[]): TicketingState | undefined {
	for (const group of groups) {
		const found = states.find((s) => s.group === group);
		if (found) return found;
	}
	return undefined;
}

const SUGGESTED_GROUPS: Record<MappingKey, StateGroup[]> = {
	not_started: ['backlog', 'unstarted', 'started'],
	dev: ['started'],
	test: ['started'],
	deploy: ['started'],
	done: ['completed']
};

/** Mirrors what providers push when a key is not mapped: the first state of the matching group. */
const DEFAULT_GROUPS: Record<MappingKey, StateGroup[]> = {
	...SUGGESTED_GROUPS,
	not_started: ['unstarted', 'backlog', 'started']
};

export function suggestMapping(states: TicketingState[]): StatusMapping {
	const mapping: StatusMapping = {};
	for (const key of MAPPING_KEYS) {
		const state = pick(states, SUGGESTED_GROUPS[key]);
		if (state) mapping[key] = { id: state.id, name: state.name };
	}
	return mapping;
}

export function defaultState(
	key: MappingKey,
	states: TicketingState[]
): TicketingState | undefined {
	return pick(states, DEFAULT_GROUPS[key]);
}
