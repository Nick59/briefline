# Briefline — AI work. Human clarity.

A dev dashboard that tracks work planned and executed by AI agents, and translates their specs for humans.

- **Project → Epic → Task.** Each task moves through three
  **stages — Dev, Tests, Deploy** — and each stage is **To do, In progress or Done**.
- **Specs** (markdown, any number per epic or task) are shown in an extensible viewer, and translated into a
  **human brief**: what changes, why, how we know it is done, risks, open questions, and a glossary.
- **External tickets** (optional) in GitHub Issues, Jira, Linear, Plane or any system behind a webhook are updated when
  work moves on the dashboard.
- **API first.** Every action is a REST operation and an **MCP tool**, so agents such as Claude Code can plan
  epics and report progress directly.

Built with SvelteKit 3 (Svelte 5 runes), shadcn-svelte, Tailwind CSS 4 and SQLite (`node:sqlite`, no native
dependency).

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:5173 — starts with a demo project (PM_SEED_DEMO=false to skip)
```

The dev server listens on every network interface, so other devices on your Tailscale network can open it at
`http://<tailscale-ip>:5173` or by MagicDNS name — the short name
(this machine's hostname) and full `*.ts.net` / `*.tailnet.internal` names are allowed in `vite.config.ts`.
This also exposes it on your local network.

Requires Node 22.17 or later. Copy `.env.example` to `.env` to configure the server.

| Command      | What it does                                  |
| ------------ | --------------------------------------------- |
| `pnpm dev`   | Development server                            |
| `pnpm test`  | Unit and integration tests (Vitest)           |
| `pnpm check` | Type check (svelte-check)                     |
| `pnpm lint`  | Prettier and ESLint                           |
| `pnpm build` | Production build (adapter-node) into `build/` |
| `pnpm start` | Run the production build                      |

> **Production over plain HTTP.** adapter-node assumes `https` unless told otherwise, and SvelteKit then rejects
> dashboard form posts as cross-site. Serve over HTTPS, or behind a proxy with `PROTOCOL_HEADER=x-forwarded-proto`
> (and `HOST_HEADER=x-forwarded-host`). The API and MCP endpoint are not affected.

## Connect an AI agent

**MCP (Claude Code):**

```bash
claude mcp add --transport http briefline http://localhost:5173/mcp --header "X-Actor: claude-code"
# with PM_API_TOKEN set, add: --header "Authorization: Bearer <token>"
```

The MCP server is stateless JSON-RPC over HTTP (`POST /mcp`). Its `initialize` result carries instructions that
explain the model and the expected workflow to the agent.

Over MCP, agents must send a `brief` (the plain-language summary for non-engineers) whenever they create a spec or change its
content (`add_epic_spec`, `add_task_spec`, `update_spec` with `content`, `create_epic` specs). `set_spec_brief` rewrites the
brief alone. The REST API and the dashboard keep the brief optional.

**REST:** `GET /api/v1` lists every operation, and `GET /api/v1/openapi.json` describes them in OpenAPI 3.1.
The in-app page **API & MCP** (`/docs`) shows the same list with copy-paste examples.

```bash
# Plan a whole epic in one call
curl -X POST localhost:5173/api/v1/projects/SHOP/epics -H 'content-type: application/json' -H 'x-actor: my-agent' -d '{
  "title": "Search v2",
  "tasks": [{ "title": "Search endpoint", "specs": [{ "title": "API spec", "content": "# ..." }] }]
}'

# Report progress (move_task also reorders: {"stage":"dev","status":"done","beforeTask":"SHOP-3"})
curl -X PUT localhost:5173/api/v1/tasks/SHOP-7/stages/dev -H 'content-type: application/json' -d '{"status":"done","note":"Merged #128"}'
```

Conventions: ids and keys are interchangeable (`SHOP`, `SHOP-E1`, `SHOP-12`); `X-Actor` names who made a change in
the activity log and ticket comments; errors are `{ "error": { "code", "message", "issues" } }`.
Activity (`get_project_activity`, `get_epic_activity`) is paginated, newest first: pass `limit` (default 10, max 100) and
`offset`, and read `{ items, total, limit, offset, hasMore, nextOffset }` to fetch older entries.

## Ticketing

Set up ticketing in two steps.

1. **Connections** (top-level **Ticketing** menu): one per account in an external system, with its settings (site URL,
   workspace) and API key. Keys are encrypted with AES-256-GCM and never shown again; leave the field empty on edit to
   keep the saved key, or use **Clear** to remove it.
2. **Project settings**: select a connection, fill in the project-level field (Plane project id, Jira project key,
   Linear team key, GitHub default repository) and **map statuses**: Not started, Dev, Test, Deploy and Done each to
   one external state. **Suggest mapping** proposes backlog/unstarted, started and completed states; rows left on
   Default keep the provider's own rule.

Then link an epic (and optionally a task) to a ticket. With automatic sync on, every stage change moves the ticket to
the mapped state (and posts an optional comment). A task is Not started until work begins, then follows its current
stage (Dev, Test, Deploy), then Done; an epic follows its current stage the same way. If a mapped state no longer exists
remotely the default is used and the sync job records it. Each push is a **sync job**: visible in the sync log, with
its error, and retryable.

Set `BRIEFLINE_SECRET_KEY` (32 bytes, base64 or hex) before saving API keys:

```bash
openssl rand -base64 32
```

Without it keys cannot be saved, and keys already stored cannot be read. Connections without a stored key fall back
to the provider's environment variable, so setups from before connections existed keep working; the Ticketing menu
shows "Using environment variable" for them. On upgrade, each project's old settings become a connection (projects with
the same account share one) and the project-level fields move to the project.

| Provider  | Connection fields                     | Project fields              | Default status rule (unmapped rows)                      | Key (env fallback)             |
| --------- | ------------------------------------- | --------------------------- | -------------------------------------------------------- | ------------------------------ |
| `github`  | —                                     | default repository          | Done → closed, otherwise open                            | `GITHUB_TOKEN`                 |
| `jira`    | site URL, account email               | project key, preferred done | status category transition (To Do, In Progress, Done)    | `JIRA_EMAIL`, `JIRA_API_TOKEN` |
| `linear`  | workspace slug                        | team key                    | first workflow state of type unstarted/started/completed | `LINEAR_API_KEY`               |
| `plane`   | workspace slug, API URL (self-hosted) | project id                  | first state of group unstarted/started/completed         | `PLANE_API_KEY`                |
| `webhook` | endpoint URL, ticket URL template     | —                           | POSTs JSON, signed with `x-pm-signature: sha256=…`       | `PM_WEBHOOK_SECRET` (optional) |
| `dry-run` | ticket URL template                   | —                           | Records the update without calling anything              | —                              |

Mappable states come from the system: Plane states, Linear team workflow states, Jira project statuses (a push picks
the transition whose target is the mapped status; an issue already in it is left alone), GitHub `open`/`closed`. The
webhook provider has no states. Operations: `list_ticketing_connections`, `get_ticketing_connection`,
`create_ticketing_connection`, `update_ticketing_connection`, `delete_ticketing_connection` (refused while projects use
it), `test_ticketing_connection`, `list_ticketing_states` and `set_project_ticketing`. Secrets are write-only: responses
carry `hasSecret` and `secretSource` (`stored`, `env` or `none`). Pushes to the same ticket run in order.
Add a provider by implementing `TicketProvider` (`src/lib/server/modules/ticketing/provider.ts`) and registering it
in `registry.ts`.

## Human briefs

`translate_spec` (button **Translate for humans**) writes a brief for a spec. Without configuration it uses an offline
rule-based translator that reads the headings AI agents usually write (Goals, Scope, Acceptance criteria, Risks,
Open questions…). With `ANTHROPIC_API_KEY` set it uses Claude (`PM_BRIEF_MODEL`, default `claude-opus-5-5`, structured
output) and falls back to the offline translator if the call fails. Editing a spec's content clears its brief.

## Architecture

Feature-Sliced Design in `src/lib`, layers importing only from layers below:

```
routes/        SvelteKit routes: load data, export the shared `run` action, render a page
lib/pages/     Page compositions (home, project, project-settings, epic, task, docs, login)
lib/widgets/   app-shell (sidebar), epic-header, epic-timeline, stage-board, spec-panel, activity-feed, sync-log
lib/features/  User actions: project/epic/task forms, change-task-status, spec-editor, translate-spec,
               link-ticket, sync-ticket, configure-ticketing, delete-entity, theme-toggle
lib/entities/  Display of domain objects: work-status, task, epic, project, spec, activity, sync-job
lib/shared/    domain (types, zod schemas, progress math), config/tokens, ui (shadcn primitives + small
               design-system components + markdown viewer), lib (format, run-operation)
lib/server/    Backend (server-only): db, modules/<domain>/{repository,service}, api, mcp, http
```

**One operations catalog** (`src/lib/server/api/operations.ts`) defines every operation once — name, HTTP route,
zod input, handler. The REST router (`/api/v1/[...path]`), the MCP tools, the OpenAPI document and the dashboard all
run through it, so validation and business rules are identical for humans and agents. The dashboard calls operations
through a single form action (`run`, see `shared/lib/run-operation.ts`).

Services emit **domain events**; the activity log and ticket sync subscribe to them.

## Design tokens

`src/lib/shared/config/tokens/tokens.css` defines three tiers: primitives (`--p-*` palette and scales), semantic tokens
(surfaces, `--status-*`, `--stage-*`, `--priority-*`, feedback, motion) for light and dark, and the Tailwind theme
mapping in `src/routes/layout.css` (`bg-status-done`, `text-stage-test`…). Components take a **tone**
(`src/lib/shared/config/tokens/index.ts`) rather than a color, so the palette changes in one place.

## Markdown extensions

`MarkdownViewer` renders untrusted markdown safely: raw HTML is escaped and links with unsafe protocols are dropped.
Built-in extensions: callouts (`> [!WARNING]`), heading anchors, code blocks with copy buttons, task lists, external
links, and **Mermaid diagrams**: ` ```mermaid ` blocks render as diagrams (loaded only when a page has one), follow
the light/dark theme, show the parse error when invalid, and are repeated in the Human brief tab. The spec editor's
**Insert diagram** menu adds starter templates. Add your own:

```ts
import type { MarkdownExtension } from '#lib/shared/ui/markdown/index.ts';

export const jiraKeys: MarkdownExtension = {
	name: 'jira-keys',
	postprocess: (html) =>
		html.replace(/\b([A-Z]+-\d+)\b/g, '<a href="https://jira.example.com/browse/$1">$1</a>'),
	enhance: (node) => {
		/* runs in the browser on the rendered DOM; return a cleanup function */
	}
};
```

Pass it with `<MarkdownViewer source={md} extensions={[jiraKeys]} />` (or `extensions` on `SpecPanel`), or add it to
`defaultMarkdownExtensions` to apply it everywhere. An extension can also provide a `marked` extension to change parsing.

## Configuration

| Variable               | Default                   | Purpose                                                               |
| ---------------------- | ------------------------- | --------------------------------------------------------------------- |
| `PM_DATABASE_PATH`     | `data/project-manager.db` | SQLite file                                                           |
| `PM_API_TOKEN`         | —                         | Requires a bearer token on `/api` and `/mcp`, and a dashboard sign-in |
| `PM_PUBLIC_URL`        | —                         | Dashboard URL used in ticket comments                                 |
| `PM_SEED_DEMO`         | `true`                    | Create the demo project when the database is empty                    |
| `BRIEFLINE_SECRET_KEY` | —                         | Encrypts API keys saved on ticketing connections                      |
| `ANTHROPIC_API_KEY`    | —                         | Use Claude for human briefs                                           |
| `PM_BRIEF_MODEL`       | `claude-opus-5-5`         | Claude model for briefs                                               |

Requests with an `Origin` header from another site are refused on `/api` and `/mcp`.
