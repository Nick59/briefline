import {
	expectOk,
	providerFetch,
	requireSecret,
	resolveMapped,
	TicketProviderError,
	TIMEOUT_MS,
	type ProviderContext,
	type ProviderState,
	type TicketProvider
} from '../provider.ts';

interface IssueRef {
	repo: string;
	number: string;
}

export function parseGithubRef(key: string, defaultRepo?: string): IssueRef {
	const match = key.trim().match(/^(?:([\w.-]+\/[\w.-]+))?#?(\d+)$/);
	const repo = match?.[1] ?? defaultRepo;
	if (!match || !repo)
		throw new TicketProviderError(
			`Cannot read GitHub issue reference '${key}'. Use owner/repo#123.`
		);
	return { repo, number: match[2] };
}

// Issues have only two states, so they double as the mappable states.
const STATES: ProviderState[] = [
	{ id: 'open', name: 'Open', group: 'started' },
	{ id: 'closed', name: 'Closed', group: 'completed' }
];

async function call(ctx: ProviderContext, path: string, method: string, body?: unknown) {
	const response = await providerFetch(
		ctx,
		'GitHub',
		`https://api.github.com${path}`,
		{
			method,
			headers: {
				accept: 'application/vnd.github+json',
				authorization: `Bearer ${requireSecret(ctx)}`,
				'content-type': 'application/json',
				'x-github-api-version': '2022-11-28'
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		},
		{ json: false }
	);
	await expectOk(response, `GitHub ${method} ${path}`, ctx);
}

export const githubProvider: TicketProvider = {
	reservedHeaders: ['authorization'],
	id: 'github',
	label: 'GitHub Issues',
	description:
		'Closes the issue when the work is done, reopens it otherwise, and posts progress comments.',
	settings: [
		{
			name: 'repo',
			label: 'Default repository',
			required: false,
			scope: 'project',
			placeholder: 'owner/repo'
		}
	],
	envVars: ['GITHUB_TOKEN'],
	secretLabel: 'Personal access token',
	secretEnvVar: 'GITHUB_TOKEN',
	supportsStates: true,
	ticketUrl(ref, settings) {
		try {
			const { repo, number } = parseGithubRef(ref.key, settings.repo);
			return `https://github.com/${repo}/issues/${number}`;
		} catch {
			return null;
		}
	},
	async testConnection(ctx) {
		await call(ctx, '/user', 'GET');
	},
	async listStates() {
		return STATES;
	},
	async push(ctx, update) {
		const { repo, number } = parseGithubRef(ctx.ref.key, ctx.settings.repo);
		const mapped = resolveMapped(ctx, STATES);
		const done = mapped.state ? mapped.state.id === 'closed' : update.status === 'done';
		await call(ctx, `/repos/${repo}/issues/${number}`, 'PATCH', {
			state: done ? 'closed' : 'open',
			...(done ? { state_reason: 'completed' } : {})
		});
		if (update.comment)
			await call(ctx, `/repos/${repo}/issues/${number}/comments`, 'POST', { body: update.comment });
		return { note: mapped.note };
	}
};
