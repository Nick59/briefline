import {
	expectOk,
	requireEnv,
	TicketProviderError,
	TIMEOUT_MS,
	type TicketContext,
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

async function call(ctx: TicketContext, path: string, method: string, body: unknown) {
	const response = await ctx.fetch(`https://api.github.com${path}`, {
		method,
		headers: {
			accept: 'application/vnd.github+json',
			authorization: `Bearer ${requireEnv(ctx, 'GITHUB_TOKEN')}`,
			'content-type': 'application/json',
			'x-github-api-version': '2022-11-28'
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	await expectOk(response, `GitHub ${method} ${path}`);
}

export const githubProvider: TicketProvider = {
	id: 'github',
	label: 'GitHub Issues',
	description:
		'Closes the issue when the work is deployed, reopens it otherwise, and posts progress comments.',
	settings: [
		{ name: 'repo', label: 'Default repository', required: false, placeholder: 'owner/repo' }
	],
	envVars: ['GITHUB_TOKEN'],
	ticketUrl(ref, settings) {
		try {
			const { repo, number } = parseGithubRef(ref.key, settings.repo);
			return `https://github.com/${repo}/issues/${number}`;
		} catch {
			return null;
		}
	},
	async push(ctx, update) {
		const { repo, number } = parseGithubRef(ctx.ref.key, ctx.settings.repo);
		const done = update.status === 'done';
		await call(ctx, `/repos/${repo}/issues/${number}`, 'PATCH', {
			state: done ? 'closed' : 'open',
			...(done ? { state_reason: 'completed' } : {})
		});
		if (update.comment)
			await call(ctx, `/repos/${repo}/issues/${number}/comments`, 'POST', { body: update.comment });
	}
};
