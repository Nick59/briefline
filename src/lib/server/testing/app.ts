import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, type ServerConfig } from '../config.ts';
import { createContainer } from '../container.ts';
import { openDatabase } from '../db/connection.ts';

/** A throwaway directory, so a test never sweeps the files of a real data directory. */
export const testAttachmentsDir = () => join(tmpdir(), `briefline-attachments-${randomUUID()}`);

export const testConfig = () => ({ ...readConfig({}), attachmentsDir: testAttachmentsDir() });

export interface FetchCall {
	url: string;
	init: RequestInit;
}

/** A fresh in-memory app. The fake fetch records every outgoing request instead of sending it. */
export function testApp(
	env: Record<string, string | undefined> = {},
	respond: (call: FetchCall) => Response = () => Response.json({}),
	config: Partial<ServerConfig> = {}
) {
	const calls: FetchCall[] = [];
	const fetchImpl = (async (url: string | URL, init: RequestInit = {}) => {
		const call = { url: String(url), init };
		calls.push(call);
		return respond(call);
	}) as typeof fetch;
	const app = createContainer(openDatabase(':memory:'), {
		config: { ...testConfig(), ...config },
		env,
		fetch: fetchImpl
	});
	return { app, calls };
}

type TestApp = ReturnType<typeof testApp>['app'];

/** Creates a connection and selects it for the project. Flat settings are split by field scope. */
export function connectProject(
	app: TestApp,
	projectKey: string,
	provider: string,
	settings: Record<string, string> = {},
	extra: {
		secret?: string;
		statusMapping?: Record<string, { id: string; name: string }>;
		name?: string;
	} = {}
) {
	const fields = app.ticketing.providers().find((p) => p.id === provider)!.settings;
	const pick = (scope: 'connection' | 'project') =>
		Object.fromEntries(
			Object.entries(settings).filter(([name]) =>
				fields.some((f) => f.name === name && f.scope === scope)
			)
		);
	const connection = app.connections.create({
		name: extra.name ?? `${provider} test`,
		provider,
		settings: pick('connection'),
		secret: extra.secret
	});
	app.connections.setProjectTicketing(
		projectKey,
		{ connectionId: connection.id, target: pick('project'), statusMapping: extra.statusMapping },
		'test'
	);
	return connection;
}
