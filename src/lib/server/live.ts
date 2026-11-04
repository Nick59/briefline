import type { PresenceSnapshot } from '#lib/shared/domain/presence.ts';
import type { PullMessage, PullStatus } from '#lib/shared/domain/pull-status.ts';
import { EventBus } from './core/events.ts';

/** What survives a re-evaluation of runtime.ts: the relay bus and the means to retire the previous container. */
export interface LiveState {
	bus: EventBus;
	presence: Set<(snapshot: PresenceSnapshot) => void>;
	pulls: Set<(message: PullMessage) => void>;
	dispose?: () => void;
}

interface Closable {
	events: EventBus;
	presence: { subscribe(listener: (snapshot: PresenceSnapshot) => void): () => void };
	ticketPull: {
		stop(): void;
		subscribe(listener: (projectId: string, status: PullStatus) => void): () => void;
	};
	db: { close(): void };
}

const globals = globalThis as { __brieflineLiveBus?: LiveState };

/** The process-wide relay bus. Routes subscribe here, so they receive events of whichever container is current. */
export const liveState = (): LiveState =>
	(globals.__brieflineLiveBus ??= { bus: new EventBus(), presence: new Set(), pulls: new Set() });

/**
 * Builds a container after retiring the previous one: its forwarder is removed and its database closed,
 * so a replaced container never emits twice or keeps a handle. The new container forwards to the relay bus.
 */
export function installContainer<T extends Closable>(state: LiveState, create: () => T): T {
	state.dispose?.();
	state.dispose = undefined;
	const container = create();
	const unsubscribe = container.events.subscribe((event) => state.bus.emit(event));
	const unsubscribePresence = container.presence.subscribe((snapshot) => {
		for (const listener of state.presence) listener(snapshot);
	});
	const unsubscribePull = container.ticketPull.subscribe((projectId, status) => {
		for (const listener of state.pulls) listener({ projectId, status });
	});
	state.dispose = () => {
		unsubscribe();
		unsubscribePull();
		unsubscribePresence();
		container.ticketPull.stop();
		try {
			container.db.close();
		} catch (error) {
			console.error('[runtime] closing the replaced database failed', error);
		}
	};
	return container;
}
