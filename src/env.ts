import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value;

const names = [
	'BRIEFLINE_SECRET_KEY',
	'PM_DATABASE_PATH',
	'BRIEFLINE_ATTACHMENTS_DIR',
	'PM_API_TOKEN',
	'PM_PUBLIC_URL',
	'PM_SEED_DEMO',
	'PM_BRIEF_MODEL',
	'PM_WEBHOOK_SECRET',
	'ANTHROPIC_API_KEY',
	'GITHUB_TOKEN',
	'JIRA_EMAIL',
	'JIRA_API_TOKEN',
	'LINEAR_API_KEY',
	'PLANE_API_KEY',
	'BRIEFLINE_DEBUG_TICKETING'
] as const;

export const variables = defineEnvVars(
	Object.fromEntries(names.map((name) => [name, { schema: optional }])) as Record<
		(typeof names)[number],
		{ schema: typeof optional }
	>
);
