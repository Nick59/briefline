import { describe, expect, it, vi } from 'vitest';
import { EventBus, type DomainEvent } from './core/events.ts';
import type { PullStatus } from '#lib/shared/domain/pull-status.ts';
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
	const stop = vi.fn();
	return {
		events: new EventBus(),
		presence: { subscribe: () => () => {} },
		ticketPull: { stop, subscribe: () => () => {} },
		db: { close }
	};
}

describe('installContainer', () => {
	it('relays pull status to pull listeners without emitting a domain event', () => {
		const state: LiveState = { bus: new EventBus(), presence: new Set(), pulls: new Set() };
		const seenEvents = vi.fn();
		const seenPulls = vi.fn();
		state.bus.subscribe(seenEvents);
		state.pulls.add(seenPulls);
		let emit = (_projectId: string, _status: PullStatus) => {};
		installContainer(state, () => ({
			...fake(),
			ticketPull: {
				stop: vi.fn(),
				subscribe: (listener: typeof emit) => ((emit = listener), () => {})
			}
		}));
		const status = { running: true, lastPulledAt: null, updated: 0, error: null };
		emit('p', status);
		expect(seenPulls).toHaveBeenCalledWith({ projectId: 'p', status });
		expect(seenEvents).not.toHaveBeenCalled();
	});

	it('forwards events of the container to the relay bus', () => {
		const state: LiveState = { bus: new EventBus(), presence: new Set(), pulls: new Set() };
		const seen = vi.fn();
		state.bus.subscribe(seen);
		const container = installContainer(state, fake);
		container.events.emit(event);
		expect(seen).toHaveBeenCalledTimes(1);
	});

	it('retires the previous container: no forwarding, database closed', () => {
		const state: LiveState = { bus: new EventBus(), presence: new Set(), pulls: new Set() };
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

	it('stops the ticket pull before closing the database', () => {
		const state: LiveState = { bus: new EventBus(), presence: new Set(), pulls: new Set() };
		const first = installContainer(state, fake);
		installContainer(state, fake);
		expect(first.ticketPull.stop).toHaveBeenCalledTimes(1);
		expect(first.ticketPull.stop.mock.invocationCallOrder[0]).toBeLessThan(
			first.db.close.mock.invocationCallOrder[0]
		);
	});

	it('still installs when closing the old database throws', () => {
		const state: LiveState = { bus: new EventBus(), presence: new Set(), pulls: new Set() };
		const first = installContainer(state, fake);
		first.db.close.mockImplementation(() => {
			throw new Error('boom');
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => installContainer(state, fake)).not.toThrow();
	});
});
