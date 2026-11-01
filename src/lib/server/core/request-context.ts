import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
	sessionId: string | null;
}

const globals = globalThis as { __brieflineRequestContext?: AsyncLocalStorage<RequestContext> };
const storage = (globals.__brieflineRequestContext ??= new AsyncLocalStorage<RequestContext>());

/**
 * Services receive only the actor name, so the agent session travels beside the call instead of
 * through every service signature. It also follows async work started by the call.
 */
export const runInRequestContext = <T>(context: RequestContext, run: () => T): T =>
	storage.run(context, run);

export const currentSessionId = (): string | null => storage.getStore()?.sessionId ?? null;
