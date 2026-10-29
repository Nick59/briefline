import { readConfig } from '../config.ts';
import { createContainer } from '../container.ts';
import { openDatabase } from '../db/connection.ts';

export interface FetchCall {
	url: string;
	init: RequestInit;
}

/** A fresh in-memory app. The fake fetch records every outgoing request instead of sending it. */
export function testApp(
	env: Record<string, string | undefined> = {},
	respond: (call: FetchCall) => Response = () => Response.json({})
) {
	const calls: FetchCall[] = [];
	const fetchImpl = (async (url: string | URL, init: RequestInit = {}) => {
		const call = { url: String(url), init };
		calls.push(call);
		return respond(call);
	}) as typeof fetch;
	const app = createContainer(openDatabase(':memory:'), {
		config: readConfig({}),
		env,
		fetch: fetchImpl
	});
	return { app, calls };
}
