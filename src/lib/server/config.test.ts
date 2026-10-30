import { describe, expect, it } from 'vitest';
import { readConfig } from './config.ts';

describe('readConfig', () => {
	it('reads settings from the env object it is given', () => {
		const config = readConfig({
			PM_API_TOKEN: 'token',
			ANTHROPIC_API_KEY: 'key',
			PM_DATABASE_PATH: 'x.db',
			PM_SEED_DEMO: 'false'
		});
		expect(config).toMatchObject({
			apiToken: 'token',
			anthropicApiKey: 'key',
			databasePath: 'x.db',
			seedDemo: false
		});
	});

	it('uses defaults for an empty env', () => {
		expect(readConfig({})).toMatchObject({ apiToken: null, seedDemo: true });
	});
});
