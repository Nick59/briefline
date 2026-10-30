import * as env from '$app/env/private';
import { readConfig } from './config.ts';
import { createContainer, type Container } from './container.ts';
import { openDatabase } from './db/connection.ts';
import { seedDemo } from './seed.ts';

// Vite dev can re-evaluate this module; a global keeps one container, and so one event bus, for every route.
const globals = globalThis as { __brieflineContainer?: Container };

/** The application services, created on first use with the database from the environment. */
export function app(): Container {
	if (!globals.__brieflineContainer) {
		const config = readConfig(env);
		const created = createContainer(openDatabase(config.databasePath), { config, env });
		globals.__brieflineContainer = created;
		if (config.seedDemo) seedDemo(created);
	}
	return globals.__brieflineContainer;
}

export function apiToken(): string | null {
	return readConfig(env).apiToken;
}
