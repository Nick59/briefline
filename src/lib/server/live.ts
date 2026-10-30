import { EventBus } from './core/events.ts';

/** What survives a re-evaluation of runtime.ts: the relay bus and the means to retire the previous container. */
export interface LiveState {
	bus: EventBus;
	dispose?: () => void;
}

interface Closable {
	events: EventBus;
	db: { close(): void };
}

const globals = globalThis as { __brieflineLiveBus?: LiveState };

/** The process-wide relay bus. Routes subscribe here, so they receive events of whichever container is current. */
export const liveState = (): LiveState => (globals.__brieflineLiveBus ??= { bus: new EventBus() });

/**
 * Builds a container after retiring the previous one: its forwarder is removed and its database closed,
 * so a replaced container never emits twice or keeps a handle. The new container forwards to the relay bus.
 */
export function installContainer<T extends Closable>(state: LiveState, create: () => T): T {
	state.dispose?.();
	state.dispose = undefined;
	const container = create();
	const unsubscribe = container.events.subscribe((event) => state.bus.emit(event));
	state.dispose = () => {
		unsubscribe();
		try {
			container.db.close();
		} catch (error) {
			console.error('[runtime] closing the replaced database failed', error);
		}
	};
	return container;
}
