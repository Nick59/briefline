import { AsyncLocalStorage } from 'node:async_hooks';
import type { Transport } from './events.ts';

const globals = globalThis as { __brieflineTransport?: AsyncLocalStorage<Transport | undefined> };
const storage = (globals.__brieflineTransport ??= new AsyncLocalStorage<Transport | undefined>());

/**
 * Services receive only the actor name, so the transport travels beside the call instead of through
 * every service signature. It also follows async work, such as ticket syncs started by an event.
 */
export const runWithTransport = <T>(transport: Transport | undefined, run: () => T): T =>
	storage.run(transport, run);

export const currentTransport = (): Transport | undefined => storage.getStore();
