export interface ServerConfig {
	databasePath: string;
	apiToken: string | null;
	anthropicApiKey: string | null;
	anthropicModel: string;
	seedDemo: boolean;
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
	return {
		databasePath: env.PM_DATABASE_PATH || 'data/project-manager.db',
		apiToken: env.PM_API_TOKEN || null,
		anthropicApiKey: env.ANTHROPIC_API_KEY || null,
		anthropicModel: env.PM_BRIEF_MODEL || 'claude-opus-5-5',
		seedDemo: env.PM_SEED_DEMO !== 'false'
	};
}
