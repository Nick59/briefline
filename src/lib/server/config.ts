import { dirname, join } from 'node:path';

export interface ServerConfig {
	databasePath: string;
	attachmentsDir: string;
	apiToken: string | null;
	anthropicApiKey: string | null;
	anthropicModel: string;
	seedDemo: boolean;
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
	const databasePath = env.PM_DATABASE_PATH || 'data/project-manager.db';
	return {
		databasePath,
		attachmentsDir: env.BRIEFLINE_ATTACHMENTS_DIR || join(dirname(databasePath), 'attachments'),
		apiToken: env.PM_API_TOKEN || null,
		anthropicApiKey: env.ANTHROPIC_API_KEY || null,
		anthropicModel: env.PM_BRIEF_MODEL || 'claude-opus-5-5',
		seedDemo: env.PM_SEED_DEMO !== 'false'
	};
}
