<script lang="ts">
	import { onMount } from 'svelte';
	import * as Tabs from '#lib/shared/ui/primitives/tabs/index.js';
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

	const fence = (lang: string, body: string) => '```' + lang + '\n' + body + '\n```';
	const url = $derived(`${origin}/mcp`);
	const bearer = '"Authorization: Bearer $PM_API_TOKEN"';

	const AGENTS = ['claude-code', 'codex', 'cursor', 'gemini-cli', 'other'] as const;
	type AgentId = (typeof AGENTS)[number];
	const tabs: { id: AgentId; label: string }[] = [
		{ id: 'claude-code', label: 'Claude Code' },
		{ id: 'codex', label: 'Codex' },
		{ id: 'cursor', label: 'Cursor' },
		{ id: 'gemini-cli', label: 'Gemini CLI' },
		{ id: 'other', label: 'Other MCP client' }
	];
	const TAB_KEY = 'docs-agent-tab';

	let agent = $state<AgentId>('claude-code');
	onMount(() => {
		try {
			const saved = localStorage.getItem(TAB_KEY);
			if (AGENTS.includes(saved as AgentId)) agent = saved as AgentId;
		} catch {
			/* The choice only lasts for this page load. */
		}
	});
	const chooseAgent = (value: string) => {
		agent = value as AgentId;
		try {
			localStorage.setItem(TAB_KEY, value);
		} catch {
			/* The choice only lasts for this page load. */
		}
	};

	const connect = $derived<Record<AgentId, string>>({
		'claude-code': `${fence(
			'bash',
			`claude mcp add --scope user --transport http briefline ${url}${tokenRequired ? ` --header ${bearer}` : ''} --header "X-Actor: claude-code"`
		)}

\`--scope user\` makes the server available in every repository. Restart Claude Code after adding it.

- Instructions: put the rules in \`~/.claude/CLAUDE.md\`. In each repository, \`CLAUDE.md\` contains \`@AGENTS.md\`.
- Verify: run \`claude mcp list\`, or \`/mcp\` inside Claude Code. \`briefline\` should be connected.`,

		codex: `Add this to \`~/.codex/config.toml\`:

${fence(
	'toml',
	`[mcp_servers.briefline]
url = "${url}"
${tokenRequired ? 'bearer_token_env_var = "PM_API_TOKEN"\n' : ''}http_headers = { "X-Actor" = "codex" }`
)}

${tokenRequired ? 'Codex reads the token from the `PM_API_TOKEN` environment variable. ' : ''}\`codex mcp add\` is not used here because the docs only show it without custom headers.

- Instructions: put the rules in \`~/.codex/AGENTS.md\`. In each repository, \`AGENTS.md\` names the project.
- Verify: run \`codex mcp list\`, or \`/mcp\` inside the Codex TUI.`,

		cursor: `Add this to \`~/.cursor/mcp.json\` (or \`.cursor/mcp.json\` for one project):

${fence(
	'json',
	`{
  "mcpServers": {
    "briefline": {
      "url": "${url}",
      "headers": {
${tokenRequired ? '        "Authorization": "Bearer ${env:PM_API_TOKEN}",\n' : ''}        "X-Actor": "cursor"
      }
    }
  }
}`
)}

- Instructions: paste the rules into Cursor's user rules (Customize, then Rules). Cursor reads \`AGENTS.md\` in each repository.
- Verify: open Cursor's MCP settings. \`briefline\` should list its tools.`,

		'gemini-cli': `${fence(
			'bash',
			`gemini mcp add -s user --transport http --header "X-Actor: gemini-cli"${tokenRequired ? ` --header ${bearer}` : ''} briefline ${url}`
		)}

Or add this to \`~/.gemini/settings.json\`:

${fence(
	'json',
	`{
  "mcpServers": {
    "briefline": {
      "httpUrl": "${url}",
      "headers": {
${tokenRequired ? '        "Authorization": "Bearer <token>",\n' : ''}        "X-Actor": "gemini-cli"
      }
    }
  }
}`
)}

- Instructions: put the rules in \`~/.gemini/GEMINI.md\`. To read the repository's \`AGENTS.md\`, set \`"context": { "fileName": ["AGENTS.md", "GEMINI.md"] }\` in \`settings.json\`.
- Verify: run \`gemini mcp list\`, or \`/mcp\` inside Gemini CLI.`,

		other: `Point any client that supports streamable HTTP MCP at:

${fence(
	'text',
	`URL:      ${url}
Header:   X-Actor: <your-agent-name>${tokenRequired ? '\nHeader:   Authorization: Bearer <token>' : ''}`
)}

The server speaks JSON-RPC over \`POST /mcp\` and returns an \`Mcp-Session-Id\` header from \`initialize\`; clients that send it back get their changes grouped into a session. Check the client's docs for where it takes a URL and custom headers. Setup tools (projects, ticketing connections, profile) are hidden from the tool list by default; use \`${url}?tools=all\` to list them too.

- Instructions: put the rules in the client's global instructions file, and name the project in the repository's \`AGENTS.md\`.
- Verify: list the client's MCP tools. They match the operations below.`
	});

	const intro = $derived(`## Connect your agent

Briefline works with any MCP client. Pick yours. Every REST operation below is also an MCP tool with the same name and input.`);

	const rules = `## Agent rules

The MCP server already tells the agent how Briefline works. These rules tell it when to use it, and which project a repository belongs to. Add them once to your global instructions file:

- Claude Code: \`~/.claude/CLAUDE.md\`
- Codex: \`~/.codex/AGENTS.md\`
- Gemini CLI: \`~/.gemini/GEMINI.md\`
- Cursor: user rules (Customize, then Rules)
- Others: the client's global instructions file

${fence(
	'markdown',
	`## Briefline

When the repository's agent instructions (AGENTS.md, CLAUDE.md, GEMINI.md...) name a Briefline project, track the work there through the \`briefline\` MCP server:
- Before planning, read the project with \`get_project\` and the current epic with \`get_epic\`.
- At the start of a session, call \`get_last_session\` (with the project when known) to read what the previous session did, and \`get_activity_changes\` to see what changed since your last pull.
- Project-wide context (architecture, conventions, product goals) lives in project specs: read them with \`list_specs\` (\`project\`) before planning, and add new ones with \`add_spec\`.
- Ask anything unclear with \`add_epic_questions\` before starting an epic. Questions are threads: people can open them too, and anyone adds details with \`reply_to_question\`. Tasks can't start while questions are open; read the answers and the replies (\`messages\`) with \`list_epic_questions\` and follow them.
- A plan for new work becomes one epic with its tasks and specs, created in a single \`create_epic\` call.
- Every spec includes a plain-language \`brief\` for non-engineers.
- Move each task as you work with \`set_task_stage_status\`: dev, then test, then deploy; in_progress when you start, done when you finish.
- Read a task's comments in \`get_task\` (people comment too, act on them) and record findings, decisions or blockers with \`add_task_comment\`.
- Attach screenshots with \`upload_attachment\` and embed the returned \`markdown\` in specs, task descriptions and comments.
- Before you end your work, call \`set_session_summary\` with a short recap of what the session did; it shows on the Sessions page.
- Never create a Briefline project yourself; ask when the repository names none.`
)}

### In each repository

Write the project key once, in \`AGENTS.md\`:

${fence('markdown', 'Briefline project: SHOP')}

Claude Code reads \`CLAUDE.md\` instead of \`AGENTS.md\`. Make \`CLAUDE.md\` contain one line, \`@AGENTS.md\`, so the rules are written once.

> [!NOTE]
> \`get_activity_changes\` keeps one bookmark per \`X-Actor\`. Give each concurrent session its own \`X-Actor\`, for example \`codex-api\` and \`claude-code-web\`.

### Sessions

Every MCP connection is an agent session. The server opens one on \`initialize\` and the client sends its id back in the \`Mcp-Session-Id\` header, so each change in the activity log links to the session that made it. The **Sessions** page groups them by day with a recap of what each did. \`list_sessions\` and \`get_session\` read them, \`get_last_session\` returns the previous one for context at the start of a new session, and \`set_session_summary\` lets the agent write the recap. REST and dashboard changes belong to no session.`;

	const rest = $derived(`## Call the REST API

\`\`\`bash
curl -X PUT ${origin}/api/v1/tasks/SHOP-3/stages/dev \\
  -H "content-type: application/json" -H "x-actor: my-agent"${tokenRequired ? ' \\\n  -H "authorization: Bearer $PM_API_TOKEN"' : ''} \\
  -d '{"status":"done","note":"Merged in #128"}'
\`\`\`

- OpenAPI 3.1: [\`/api/v1/openapi.json\`](${origin}/api/v1/openapi.json)
- Ids and keys are interchangeable: \`SHOP\`, \`SHOP-E1\` and \`SHOP-12\` work wherever an id is expected.
- Send \`X-Actor\` so the activity log and ticket comments show who made the change.
- Upload an image with \`upload_attachment\` (\`POST /api/v1/attachments\`, base64 \`data\`) and paste the returned \`markdown\` (\`![name](/attachments/<id>)\`) into a spec, task description or comment. PNG, JPEG, GIF or WebP, up to 10 MB.
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

	<div class="space-y-4">
		<MarkdownViewer source={intro} />
		<Tabs.Root value={agent} onValueChange={chooseAgent} class="gap-4">
			<div class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
				<Tabs.List class="h-auto w-max justify-start gap-1 bg-transparent p-0">
					{#each tabs as tab (tab.id)}
						<Tabs.Trigger
							value={tab.id}
							class="h-auto flex-none rounded-lg border border-transparent px-3 py-2 data-active:border-border data-active:bg-card data-active:shadow-xs"
						>
							{tab.label}
						</Tabs.Trigger>
					{/each}
				</Tabs.List>
			</div>
			{#each tabs as tab (tab.id)}
				<Tabs.Content value={tab.id}>
					<MarkdownViewer source={connect[tab.id]} />
				</Tabs.Content>
			{/each}
		</Tabs.Root>
	</div>

	<MarkdownViewer source={rules} />
	<MarkdownViewer source={rest} />

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
