import { describe, expect, it } from 'vitest';
import { EventBus, type DomainEvent } from './events.ts';
import { runWithTransport } from './operation-context.ts';

const base: DomainEvent = {
	type: 'spec.created',
	projectId: 'p',
	epicId: null,
	taskId: null,
	actor: 'a',
	data: { title: 't' }
};

describe('EventBus transport', () => {
	it('tags events emitted inside an operation, including async work', async () => {
		const bus = new EventBus();
		const seen: (string | undefined)[] = [];
		bus.subscribe((e) => seen.push(e.transport));
		await runWithTransport('mcp', async () => {
			bus.emit(base);
			await Promise.resolve();
			bus.emit(base);
		});
		bus.emit(base);
		expect(seen).toEqual(['mcp', 'mcp', undefined]);
	});
});
