import { describe, expect, it, vi } from 'vitest';
import { EventBus, type DomainEvent } from './core/events.ts';
import { installContainer, type LiveState } from './live.ts';

const event = {
	type: 'project.created',
	projectId: 'p',
	epicId: null,
	taskId: null,
	actor: 'a',
	data: { name: 'n' }
} as DomainEvent;

function fake() {
	const close = vi.fn();
	return { events: new EventBus(), db: { close } };
}

describe('installContainer', () => {
	it('forwards events of the container to the relay bus', () => {
		const state: LiveState = { bus: new EventBus() };
		const seen = vi.fn();
		state.bus.subscribe(seen);
		const container = installContainer(state, fake);
		container.events.emit(event);
		expect(seen).toHaveBeenCalledTimes(1);
	});

	it('retires the previous container: no forwarding, database closed', () => {
		const state: LiveState = { bus: new EventBus() };
		const seen = vi.fn();
		state.bus.subscribe(seen);
		const first = installContainer(state, fake);
		const second = installContainer(state, fake);
		expect(first.db.close).toHaveBeenCalledTimes(1);
		expect(second.db.close).not.toHaveBeenCalled();
		first.events.emit(event);
		expect(seen).not.toHaveBeenCalled();
		second.events.emit(event);
		expect(seen).toHaveBeenCalledTimes(1);
	});

	it('still installs when closing the old database throws', () => {
		const state: LiveState = { bus: new EventBus() };
		const first = installContainer(state, fake);
		first.db.close.mockImplementation(() => {
			throw new Error('boom');
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => installContainer(state, fake)).not.toThrow();
	});
});
