import * as env from '$app/env/private';
import { readConfig } from './config.ts';
import { createContainer, type Container } from './container.ts';
import { openDatabase } from './db/connection.ts';
import { seedDemo } from './seed.ts';

let container: Container | undefined;

/** The application services, created on first use with the database from the environment. */
export function app(): Container {
	if (!container) {
		const config = readConfig(env);
		container = createContainer(openDatabase(config.databasePath), { config, env });
		if (config.seedDemo) seedDemo(container);
	}
	return container;
}

export function apiToken(): string | null {
	return readConfig(env).apiToken;
}
