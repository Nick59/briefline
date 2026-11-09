# Briefline — AI work. Human clarity.

A dev dashboard that tracks work planned and executed by AI agents, and translates their specs for humans.

- **Project → Epic → Task.** Each task moves through three
  **stages — Dev, Tests, Deploy** — and each stage is **To do, In progress or Done**.
- **Specs** (markdown, any number per project, epic or task; project specs open from the Specs button under the project description) are shown in an extensible viewer, and translated into a
  **human brief**: what changes, why, how we know it is done, risks, open questions, and a glossary.
- **Threads.** Before starting an epic, agents ask what is unclear (`add_epic_questions`), and you can open threads yourself with
  New thread. Both sides add replies over time (`reply_to_question`) so knowledge is kept; you answer or ignore a thread in the
  Threads dialog on the epic page. While an epic has open threads its tasks can't be started (HTTP 409 `open_questions`);
  work already in progress continues. Agents read answers and replies (`messages`) with `list_epic_questions` or `get_epic`.
- **External tickets** (optional) in GitHub Issues, Jira, Linear, Plane or any system behind a webhook are updated when
  work moves on the dashboard.
- **API first.** Every action is a REST operation and an **MCP tool**, so agents such as Claude Code, Codex, Cursor or Gemini CLI can plan
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

| Command      | What it does                                       |
| ------------ | -------------------------------------------------- |
| `pnpm dev`   | Development server                                 |
| `pnpm test`  | Unit and integration tests (Vitest)                |
| `pnpm check` | Type check (svelte-check)                          |
| `pnpm lint`  | Prettier and ESLint                                |
| `pnpm build` | Production build (adapter-node) into `build/`      |
| `pnpm start` | Run the production build (reads `.env` if present) |

> **Production settings.** The built server does not load `.env` by itself. `pnpm start` runs
> `node --env-file-if-exists=.env build`, which reads `.env` from the current directory. Otherwise provide real
> environment variables (systemd, Docker `-e`, your host's settings). Restart the server after any change.

> **Production over plain HTTP.** adapter-node assumes `https` unless told otherwise, and SvelteKit then rejects
> dashboard form posts as cross-site. Serve over HTTPS, or behind a proxy with `PROTOCOL_HEADER=x-forwarded-proto`
> (and `HOST_HEADER=x-forwarded-host`). The API and MCP endpoint are not affected.

## Run with Docker and Traefik

`make up` builds the image and starts Briefline on the external `traefik` Docker network, at
`http://briefline.localhost` by default. Set `BRIEFLINE_DOMAIN` in `.env` to use another domain, and
`BRIEFLINE_ENTRYPOINT=websecure` with `BRIEFLINE_SCHEME=https` when Traefik terminates TLS. The database (`data/briefline.db`) and
the uploaded images (`data/attachments/`) live in the `data/` folder of the repository, so removing the container
or running `make clean` keeps them. Back up that folder to back up Briefline. Run `make` to list every target.

## Connect an AI agent

Briefline works with any MCP client. Connect it once per agent, with `X-Actor` set to the agent's name (and
`Authorization: Bearer <token>` when `PM_API_TOKEN` is set). Examples use `http://localhost:5173/mcp`; in Docker, use
`http://briefline.localhost/mcp` (or your `BRIEFLINE_DOMAIN`). The in-app page **API & MCP** (`/docs`) shows the same
snippets with your server's address filled in.

### Claude Code

```bash
claude mcp add --scope user --transport http briefline http://localhost:5173/mcp --header "X-Actor: claude-code"
# with PM_API_TOKEN set, add: --header "Authorization: Bearer <token>"
```

`--scope user` makes the server available in every repository. Restart Claude Code after adding it. Verify with
`claude mcp list` or `/mcp`. Put the rules in `~/.claude/CLAUDE.md`; in each repository, `CLAUDE.md` contains `@AGENTS.md`.

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.briefline]
url = "http://localhost:5173/mcp"
# with PM_API_TOKEN set (read from the environment): bearer_token_env_var = "PM_API_TOKEN"
http_headers = { "X-Actor" = "codex" }
```

Verify with `codex mcp list` or `/mcp` in the TUI. Put the rules in `~/.codex/AGENTS.md`; each repository's `AGENTS.md`
names the project.

### Cursor

Add to `~/.cursor/mcp.json` (or `.cursor/mcp.json` for one project):

```json
{
	"mcpServers": {
		"briefline": {
			"url": "http://localhost:5173/mcp",
			"headers": {
				"Authorization": "Bearer ${env:PM_API_TOKEN}",
				"X-Actor": "cursor"
			}
		}
	}
}
```

Drop the `Authorization` line when no token is set. Put the rules in Cursor's user rules (Customize, then Rules);
Cursor reads `AGENTS.md` in each repository.

### Gemini CLI

```bash
gemini mcp add -s user --transport http --header "X-Actor: gemini-cli" briefline http://localhost:5173/mcp
# with PM_API_TOKEN set, add: --header "Authorization: Bearer <token>"
```

Or in `~/.gemini/settings.json`, under `mcpServers.briefline`: `"httpUrl": "http://localhost:5173/mcp"` and
`"headers": { "X-Actor": "gemini-cli" }`. Verify with `gemini mcp list` or `/mcp`. Put the rules in
`~/.gemini/GEMINI.md`. To read `AGENTS.md`, set `"context": { "fileName": ["AGENTS.md", "GEMINI.md"] }` in
`settings.json`.

### Other MCP clients

Point any client that supports streamable HTTP at `http://localhost:5173/mcp` with the header `X-Actor: <your-agent-name>`
(plus `Authorization: Bearer <token>` when a token is set). Put the rules in the client's global instructions file.

### Protocol notes

By default `tools/list` omits the setup and admin tools (projects, ticketing connections, profile, sync jobs) to keep the list small; connect to `/mcp?tools=all` to list them too. They stay callable either way.

The MCP server speaks JSON-RPC over HTTP (`POST /mcp`) with no server-initiated stream (`GET` returns 405). Its `initialize` result carries instructions that
explain the model and the expected workflow to the agent, and the response carries an `Mcp-Session-Id` header (see Sessions).

Over MCP, agents must send a `brief` (the plain-language summary for non-engineers) whenever they create a spec or change its
content (`add_spec`, `update_spec` with `content`, `create_epic` specs). `set_spec_brief` rewrites the
brief alone. The REST API and the dashboard keep the brief optional.

### Agent rules

The MCP server tells the agent how Briefline works; the rules tell it when to use it and which project a repository
belongs to. Add them once to your global instructions file: `~/.claude/CLAUDE.md` (Claude Code), `~/.codex/AGENTS.md`
(Codex), `~/.gemini/GEMINI.md` (Gemini CLI), user rules (Cursor), or the global instructions file of any other client.

```markdown
## Briefline

When the repository's agent instructions (AGENTS.md, CLAUDE.md, GEMINI.md...) name a Briefline project, track the work there through the `briefline` MCP server:

- Before planning, read the project with `get_project` and the current epic with `get_epic`.
- At the start of a session, call `get_last_session` (with the project when known) to read what the previous session did, and `get_activity_changes` to see what changed since your last pull.
- Project-wide context (architecture, conventions, product goals) lives in project specs: read them with `list_specs` (`project`) before planning, and add new ones with `add_spec`.
- Ask anything unclear with `add_epic_questions` before starting an epic. Questions are threads: people can open them too, and anyone adds details with `reply_to_question`. Tasks can't start while questions are open; read the answers and the replies (`messages`) with `list_epic_questions` and follow them.
- A plan for new work becomes one epic with its tasks and specs, created in a single `create_epic` call.
- Every spec includes a plain-language `brief` for non-engineers.
- Move each task as you work with `set_task_stage_status`: dev, then test, then deploy; in_progress when you start, done when you finish.
- Read a task's comments in `get_task` (people comment too, act on them) and record findings, decisions or blockers with `add_task_comment`.
- Before you end your work, call `set_session_summary` with a short recap of what the session did; it shows on the Sessions page.
- Never create a Briefline project yourself; ask when the repository names none.
```

In each repository, write the project key once in `AGENTS.md`:

```markdown
Briefline project: SHOP
```

Claude Code reads `CLAUDE.md` rather than `AGENTS.md`, so make `CLAUDE.md` contain one line, `@AGENTS.md`.

`get_activity_changes` keeps one bookmark per `X-Actor`. Give each concurrent session its own `X-Actor`, for example
`codex-api` and `claude-code-web`.

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

Cancelling: `update_task` with `cancelled: true` (`PATCH /api/v1/tasks/{task}`, optional `cancelReason`) keeps a task on the board but leaves it out of epic, project and ticket progress; its stage statuses are kept and stage changes are refused until `cancelled: false` restores it.

Task comments: `get_task` returns `comments` (markdown, oldest first) and task lists carry a `commentCount`. `add_task_comment` (`POST /api/v1/tasks/{task}/comments`) and `list_task_comments` work for anyone; `update_task_comment` and `delete_task_comment` (`/api/v1/task-comments/{comment}`) only for the comment's author (403 otherwise).

### Image uploads

Images (PNG, JPEG, GIF, WebP, up to 10 MB; the type is detected from the bytes, SVG is refused) can be embedded in the
markdown of tasks, specs, comments, threads and project descriptions. In the dashboard, paste or drop an image into a
markdown field, or press **Add image**; it is uploaded and `![name](/attachments/<id>)` is inserted at the cursor. While
a task, spec or thread reply is still being created, the image is stored on its project. Agents call `upload_attachment`
(`POST /api/v1/attachments`, `{ "target": { "type": "project|task|spec", "id" }, "filename", "data": "<base64>" }`) and
paste the returned `markdown` into a spec, task description or comment. `list_attachments` (`GET /api/v1/attachments?type=&id=`)
and `delete_attachment` (`DELETE /api/v1/attachments/{attachment}`) manage them. The dashboard form posts
`multipart/form-data` (`file`, `targetType`, `targetId`) to `POST /attachments`. Images are served at
`/attachments/<id>` behind the same sign-in as the dashboard, and deleted with their project, task or spec. Files live
in an `attachments` folder next to the database (`BRIEFLINE_ATTACHMENTS_DIR` overrides it); the Docker image sets
`BODY_SIZE_LIMIT=15M` so adapter-node accepts the base64 payload.

Projects keep a user-defined order (drag them in the sidebar or on the projects page, or call `move_project` with `beforeProject`; omit it to move last).
Epics keep a user-defined order within their project (drag them on the project timeline, or call `move_epic` with `beforeEpic`; omit it to move last). `get_work_to_do` (`GET /projects/{project}/work-to-do`) lists the epics ready to work on (no open questions, specs approved, not done) in that order.

Conventions: ids and keys are interchangeable (`SHOP`, `SHOP-E1`, `SHOP-12`); `X-Actor` names who made a change in
the activity log and ticket comments; errors are `{ "error": { "code", "message", "issues" } }`.
Activity (`list_activity`, filtered by `project` or `epic`) is paginated, newest first: pass `limit` (default 50, max 200) and
`offset`, and read `{ items, total, limit, offset, hasMore, nextOffset }` to fetch older entries.

To see only what changed since your last pull, call `get_activity_changes` (`GET /api/v1/activity/changes`). It
returns `{ items, cursor, hasMore }`, oldest first; every item carries its own `cursor`. Filter with `project` or
`epic`; your own entries are left out unless `excludeOwn=false`; `limit` defaults to 50 (max 200). Without `since`,
the cursor stored for your `X-Actor` (per project/epic filter) is used and then advanced, so a repeated call returns
only new entries; with no stored cursor you get the latest entries. Without `X-Actor` nothing is stored. Pass
`cursor` as `since` to read from an exact point, and repeat while `hasMore` is true.

### Sessions

Every MCP connection is an agent session, so you can see what happened yesterday. On `initialize` the server creates a
session and returns its id in the `Mcp-Session-Id` header; MCP clients such as Claude Code send it back on every later
request. Each activity entry made through that connection stores the session id (`sessionId`); REST and dashboard
changes, and entries recorded before sessions existed, have none. An unknown id (for example after a database reset) is
created on the fly, and `DELETE /mcp` with the header marks the session ended.

- The **Sessions** page (`/sessions`) groups sessions by day with the agent and client, time range, projects touched and
  a recap (tasks done, stage changes, specs, threads, replies, answers). A session opens to its summary and activity.
  Sessions that changed nothing are hidden.
- `get_last_session` (`GET /api/v1/sessions/last`, optional `project`, `actor`, `activityLimit`) returns the most recent
  other session that has activity, in the shape of `get_session`, or `{ "session": null, "message": "No previous session" }`.
  Agents call it at the start of a session for context on work already done.
- MCP tools / REST: `list_sessions` (`GET /api/v1/sessions`, optional `actor` and `includeEmpty`), `get_session`
  (`GET /api/v1/sessions/{session}`, with paged activity) and `set_session_summary` (`PUT /api/v1/sessions/summary`).
  The agent writes a short markdown recap for the user's profile; without `session` it applies to the caller's current
  session, and each call overwrites the previous summary.
- Activity is never pruned, so session history is kept.

### User profile

On first launch the dashboard asks for your name, role, comfort with code and preferred language for briefs
(there is a Profile entry in the sidebar to edit it later). There is one profile per install. Agents read it with
`get_user_profile` (`GET /api/v1/profile`, returns `{ profile, guidance }`, `profile` is `null` until set) and the
MCP `initialize` instructions include it once set, so they adapt their tone and how technical their briefs are.
`update_user_profile` (`PUT /api/v1/profile`) sets it. The Claude-based `translate_spec` also writes briefs for this
reader, and dashboard actions appear in the activity log under your name.

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
it), `test_ticketing_connection`, `list_ticketing_states` and `set_project_ticketing` (REST and dashboard only, not an MCP tool). Secrets are write-only: responses
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

| Variable                    | Default                         | Purpose                                                                   |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| `PM_DATABASE_PATH`          | `data/project-manager.db`       | SQLite file                                                               |
| `BRIEFLINE_ATTACHMENTS_DIR` | `<database folder>/attachments` | Where uploaded images are stored                                          |
| `PM_API_TOKEN`              | —                               | Requires a bearer token on `/api` and `/mcp`, and a dashboard sign-in     |
| `PM_PUBLIC_URL`             | —                               | Dashboard URL used in ticket comments                                     |
| `PM_SEED_DEMO`              | `true`                          | Create the demo project when the database is empty                        |
| `BRIEFLINE_SECRET_KEY`      | —                               | Encrypts API keys saved on ticketing connections                          |
| `BRIEFLINE_DEBUG_TICKETING` | —                               | Set to `1` to log every ticketing request (failed ones are always logged) |
| `ANTHROPIC_API_KEY`         | —                               | Use Claude for human briefs                                               |
| `PM_BRIEF_MODEL`            | `claude-opus-5-5`               | Claude model for briefs                                                   |

Requests with an `Origin` header from another site are refused on `/api` and `/mcp`.

## License

Copyright (C) 2026 BinariesWorld. Briefline is free software under the [GNU Affero General Public License v3.0](LICENSE). You can use, modify, self-host and share it, including at work. If you distribute a modified version, or run one as a network service, you must publish its full source under the same license.

### Task comment syncing

With automatic ticket sync and comments enabled in project ticketing settings, comments on a task with a linked ticket are mirrored to that ticket. New comments include the full text and author attribution; edits update the same remote comment, and explicit deletions remove it. Comments on tasks without their own linked ticket stay in Briefline. Task descriptions are mirrored as a separate technical-description comment. Each change updates that comment; if the provider reports that it is missing or cannot be edited, a new comment is posted. Clearing the description removes its mirrored comment. The provider ticket’s own title and description are preserved.

Comment pushes are recorded in the sync log and failed jobs can be retried. Retries use the current local comment, so an old failed edit cannot overwrite a newer edit or recreate a deleted comment. Existing comments are synced when edited; enabling sync does not backfill them automatically.

The generic webhook emits `ticket.comment` with `ticket` and `comment: { id, remoteId, body, action }`; `action` is `create`, `update`, or `delete`. Consumers should use the stable local `id` to upsert comments and avoid duplicates on delivery retries. A delete carries `body: null`.
