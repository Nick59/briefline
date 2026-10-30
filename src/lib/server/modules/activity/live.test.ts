import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../core/events.ts';
import { formatSse, toLiveEvent } from './live.ts';

const event: DomainEvent = {
	type: 'task.stage_changed',
	projectId: 'p1',
	epicId: 'e1',
	taskId: 't1',
	actor: 'claude-code',
	transport: 'mcp',
	data: { key: 'PRJ-12', title: 'Fix login', stage: 'test', from: 'todo', to: 'in_progress' }
};
const at = new Date('2026-01-01T00:00:00Z');

describe('toLiveEvent', () => {
	it('serializes an event of the project', () => {
		expect(toLiveEvent(event, 'p1', at)).toMatchObject({
			type: 'task.stage_changed',
			transport: 'mcp',
			actor: 'claude-code',
			taskId: 't1',
			key: 'PRJ-12',
			title: 'Fix login',
			message: 'Moved PRJ-12 to Tests · In progress',
			at: '2026-01-01T00:00:00.000Z'
		});
	});

	it('drops events of other projects', () => {
		expect(toLiveEvent(event, 'p2', at)).toBeNull();
	});

	it('reports a missing transport as null and a spec without key', () => {
		const spec: DomainEvent = {
			type: 'spec.created',
			projectId: 'p1',
			epicId: 'e1',
			taskId: null,
			actor: 'dashboard',
			data: { title: 'Plan' }
		};
		expect(toLiveEvent(spec, 'p1', at)).toMatchObject({
			transport: null,
			key: null,
			title: 'Plan'
		});
	});

	it('frames an event for server-sent events', () => {
		const out = formatSse(toLiveEvent(event, 'p1', at)!);
		expect(out.startsWith('data: {')).toBe(true);
		expect(out.endsWith('\n\n')).toBe(true);
	});
});
