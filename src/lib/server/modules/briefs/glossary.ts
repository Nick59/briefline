/** Engineering terms that often confuse non-engineers, with a plain-language meaning. */
export const GLOSSARY: Record<string, string> = {
	api: 'the way other programs talk to this system',
	endpoint: 'one specific address other programs call',
	schema: 'the agreed shape of the data',
	migration: 'a one-time change to stored data or its structure',
	idempotent: 'safe to run more than once with the same result',
	refactor: 'reorganising code without changing what it does',
	regression: 'something that used to work and broke',
	latency: 'how long a response takes',
	throughput: 'how much work the system handles per second',
	'feature flag': 'a switch to turn a feature on or off without a release',
	rollback: 'going back to the previous version',
	'rate limit': 'a cap on how often something can be called',
	cache: 'a saved copy kept to answer faster',
	webhook: 'an automatic notification sent to another system',
	mcp: 'Model Context Protocol, how AI agents call this tool',
	ci: 'the automated checks that run on every change',
	e2e: 'tests that click through the product like a user',
	oauth: 'a standard way to sign in through another service',
	jwt: 'a signed token proving who a user is',
	sse: 'a live stream of updates from the server',
	ssr: 'pages built on the server before they reach the browser',
	'race condition': 'a bug where the result depends on timing',
	deprecate: 'mark as old and scheduled for removal',
	payload: 'the data sent in a request',
	'unit test': 'a small automated check of one piece of code',
	observability: 'being able to see what the system is doing in production'
};

export function findTerms(text: string, limit = 6): { term: string; meaning: string }[] {
	const lower = text.toLowerCase();
	return Object.entries(GLOSSARY)
		.filter(([term]) =>
			new RegExp(`\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}s?\\b`).test(lower)
		)
		.slice(0, limit)
		.map(([term, meaning]) => ({ term, meaning }));
}
