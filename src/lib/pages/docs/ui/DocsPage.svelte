<script lang="ts">
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';
	import { MarkdownViewer } from '#lib/shared/ui/markdown/index.ts';
	import type { Tone } from '#lib/shared/config/tokens/index.ts';

	interface OperationInfo {
		name: string;
		method: string;
		path: string;
		summary: string;
		tag: string;
	}

	let {
		origin,
		operations,
		tokenRequired
	}: { origin: string; operations: OperationInfo[]; tokenRequired: boolean } = $props();

	const methodTone: Record<string, Tone> = {
		GET: 'success',
		POST: 'brand',
		PUT: 'warning',
		PATCH: 'warning',
		DELETE: 'danger'
	};
	const groups = $derived(Map.groupBy(operations, (op) => op.tag));
	const auth = $derived(tokenRequired ? ' --header "Authorization: Bearer $PM_API_TOKEN"' : '');

	const setup = $derived(`## Connect an agent over MCP

\`\`\`bash
claude mcp add --transport http briefline ${origin}/mcp${auth} --header "X-Actor: claude-code"
\`\`\`

The server speaks stateless MCP over HTTP (JSON-RPC on \`POST /mcp\`). Every REST operation below is also an MCP tool with the same name and input.

## Call the REST API

\`\`\`bash
curl -X PUT ${origin}/api/v1/tasks/SHOP-3/stages/dev \\
  -H "content-type: application/json" -H "x-actor: my-agent"${tokenRequired ? ' \\\n  -H "authorization: Bearer $PM_API_TOKEN"' : ''} \\
  -d '{"status":"done","note":"Merged in #128"}'
\`\`\`

- OpenAPI 3.1: [\`/api/v1/openapi.json\`](${origin}/api/v1/openapi.json)
- Ids and keys are interchangeable: \`SHOP\`, \`SHOP-E1\` and \`SHOP-12\` work wherever an id is expected.
- Send \`X-Actor\` so the activity log and ticket comments show who made the change.
- Errors are JSON: \`{ "error": { "code", "message", "issues" } }\`.

> [!TIP]
> Create a whole plan in one call: \`create_epic\` accepts \`tasks[].specs[]\` and \`specs[]\`.
`);
</script>

<div class="max-w-5xl space-y-10">
	<PageHeader title="API & MCP">
		{#snippet description()}
			Everything in the dashboard is available to AI agents and scripts.
			{tokenRequired
				? 'This server requires a bearer token (PM_API_TOKEN).'
				: 'No token is required on this server. Set PM_API_TOKEN to require one.'}
		{/snippet}
	</PageHeader>

	<MarkdownViewer source={setup} />

	{#each [...groups] as [tag, ops] (tag)}
		<Section title={tag} count={ops.length}>
			<div class="divide-y rounded-xl border bg-card">
				{#each ops as op (op.name)}
					<div
						class="grid gap-1 p-3 md:grid-cols-[4.5rem_minmax(0,22rem)_1fr] md:items-center md:gap-4"
					>
						<ToneBadge tone={methodTone[op.method]} variant="outline" class="w-fit font-mono"
							>{op.method}</ToneBadge
						>
						<code class="truncate font-mono text-xs">{op.path}</code>
						<div class="min-w-0 text-sm">
							<span class="mr-2 font-mono text-xs text-brand">{op.name}</span>
							<span class="text-muted-foreground">{op.summary}</span>
						</div>
					</div>
				{/each}
			</div>
		</Section>
	{/each}
</div>
