export const HOW_TO_TOPICS = [
	'overview',
	'workflow',
	'inbox',
	'agents',
	'threads',
	'specs',
	'tickets'
] as const;
export type HowToTopic = (typeof HOW_TO_TOPICS)[number];

export const MCP_INSTRUCTIONS = `Briefline tracks software work for humans.
Model: Project > Epic > Task.
Call how_to for the concepts (how_to { topic } for inbox, agents, threads, specs, tickets).
Every task moves through three stages: dev, test, deploy. Each stage is todo, in_progress or done.
Typical flow for an agent:
0. Call register_agent { repo } (repo = owner/repo from git remote); with an X-Actor <repo>:<name> header you are already registered and the name is kept. Without it, the name is the trimmed content of .briefline/agent when it exists, else agent; a name the user gives you is written there (never a suffixed one like agent-2). Then get_last_session, then get_inbox; handle each item, then ack_inbox it with the seq you received. Responses include a \`meanwhile\` block with what other agents and people changed since your last call.
   The user's profile is at the end of these instructions: adapt your tone and every spec \`brief\` to the user's role and coding level.
1. list_projects, then get_project to see its epics and project specs (ready: true lists only the epics you can start, in the user's order), then get_epic to read the plan and the current board.
2. When you plan new work, call create_epic with tasks and specs in one call.
   Before starting work on an epic, ask anything unclear with add_epic_questions (one call, several questions; add context and suggested options).
   Questions are threads: a person can open one too, and anyone can add replies over time. Read the replies in each question's \`messages\` (get_epic), reply or act on threads a person opened, and add details or findings with reply_to_question.
   When an epic has specs, its tasks cannot start until a person approves them in the epic Specs header (specsApprovedAt must be set; otherwise 409 specs_not_approved); epics without specs need no approval. Tasks may be created in any stage. Approval is a one-time gate: later spec changes keep the epic approved. Tasks cannot be started while an epic has open questions, whoever opened them. Read the answers and follow them; an ignored question means use your judgement.
3. As you work, call set_task_stage_status (e.g. stage=dev status=in_progress, then done; then test...).
   A stage can start only once every earlier stage is done (test needs dev, deploy needs dev and test); moving a stage back to todo resets the later stages.
   A task that will not be done: update_task { cancelled: true, cancelReason }; it stays visible but leaves the progress. cancelled: false restores it.
   A task that cannot proceed right now: update_task { blocked: true, blockReason }; while it is blocked its stage changes are refused (409 task_blocked) and only a person can unblock it, in the Briefline UI.
   Read a task's comments in get_task; people comment too, so act on their comments, and use add_task_comment to record findings, decisions or blockers on the task as you work.
4. Attach your specs/plans as markdown with add_spec { project | epic | task }, always including the \`brief\` argument:
   the plain-language summary for non-engineers is written by you, in the same call (update_spec { spec, brief } rewrites it alone).
   Project-wide context (architecture, conventions, product goals) goes in project specs via add_spec { project }; read it with get_project before planning.
   Add diagrams as \`\`\`mermaid code blocks (flowchart, sequenceDiagram, stateDiagram-v2, erDiagram, gantt...); the dashboard renders them.
   Attach screenshots with upload_attachment and embed the returned markdown in specs, task descriptions and comments.
Linked tickets in Jira, GitHub, Linear, Plane or a webhook are updated automatically when ticket sync is on.
5. Before you end your work, call set_session_summary with a short plain-language recap of what this session did, written for the user's profile. Call it again after later chunks of work; it overwrites the previous summary.
Setup tools (projects, ticketing connections, profile) are listed only when the client connects with /mcp?tools=all.
Ids and keys are interchangeable: PMA, PMA-E1 and PMA-12 work wherever an id is expected.`;

const OVERVIEW = `# Briefline

Briefline tracks software work for humans and agents. Hierarchy: Project > Epic > Task.

- Keys: a project is PMA, an epic PMA-E1, a task PMA-12. Keys and ids are interchangeable wherever an id is expected.
- Stages: every task has three, dev, test and deploy. Each is todo, in_progress or done. Progress of epics and projects is computed from them.
- Cancelled tasks: update_task { cancelled: true, cancelReason } keeps the task on the board but takes it out of the progress; cancelled: false restores it. Stage changes on a cancelled task are refused.
- Blocked tasks: update_task { blocked: true, blockReason } pauses a task and refuses its stage changes (409 task_blocked); an agent may block to report a blocker but cannot unblock, only a person can. A blocked task is not startable: skip it, and an epic whose unfinished tasks are all blocked is left out of ready: true.
- People and agents: people use the dashboard (actors dashboard, seed and the name on the user profile). Everything else is an agent. Agents register with register_agent (default name agent).
- User profile: the user's name, role, coding level and language plus a guidance string are at the end of the MCP instructions. Specs carry a plain-language brief for non-engineers, so write it for that reader and adapt your tone to the profile.
- Sessions: every MCP connection is a session. Activity you cause is stored with it. Call get_last_session at the start to see what the previous session did, and set_session_summary before you end, with a short recap for the user's profile. It overwrites the previous summary.

Tools: how_to, list_projects, get_project, get_epic, get_task, update_task, set_task_stage_status, get_last_session, set_session_summary, find_tickets`;

const INBOX = `# Inbox

The inbox lists tasks and epics that others (people and other agents) changed since you last acknowledged them. Your own changes never show.

- Flagged by any actor. Tasks: created, updated, cancelled, restored, blocked, unblocked, commented, comment edited or deleted, stage changed. Epics: a thread (question) added, edited, answered, ignored, reopened or replied to.
- Per-agent state: acknowledging only clears the item for you. Other agents and the person still see it until they acknowledge too.
- get_inbox { project? } returns items oldest first. Each has changes (others' activity after your last acknowledgement), seq, ackedBy (other agents that acknowledged it, with upToDate telling if they saw the latest change) and, for tasks, the assignee.
- ack_inbox { items: [{ item, seq }] } with the seq you received, so a change that arrived meanwhile is not acknowledged unseen. A plain key acknowledges up to the latest change. It is safe to repeat; an unknown key fails and acknowledges nothing.
- A later change by someone else shows the item again with only the new changes.

Typical loop: get_inbox, act on each item's changes, ack_inbox with its seq.

Tools: get_inbox, ack_inbox, get_task, get_epic`;

const AGENTS = `# Agents

- register_agent { repo, name?, role? }: repo is owner/repo from git remote get-url origin (the folder name when there is none). your actor is <repo without owner>:<name> for every later call in the session. Recommended: set the header X-Actor: <repo>:<name> in the client config (e.g. briefline:agent); the session is then registered from its first request, and register_agent { repo } keeps that name. Fallback for clients without headers: name defaults to agent; pass name only when .briefline/agent exists in the repo root (use its trimmed content) or the user asked for one, and write it to the file (never a suffixed name like agent-2). MCP sessions only. Call it first.
- Uniqueness: when a name is held by an online session, you get the lowest free suffix (agent-2, agent-3...) instead of an error. A name whose session is away or offline is claimed, which ends that session, so the same name carries over next session. Names of people cannot be agents.
- Unregistered sessions whose client name is already used by a live session get a distinct name such as claude-2, claude-3.
- Soft claim: set_task_stage_status with status in_progress makes you the assignee of an unassigned task. When another agent holds it, the call still succeeds and the response carries claimedBy; check it and pick other work. A claim is never overridden.
- Meanwhile: tool responses may end with a second text item { meanwhile: { items, andMore } } holding up to 20 changes by other actors since your previous call (actor, message, target, createdAt), oldest first. andMore counts the rest.
- list_agents shows every agent seen with status online (seen in the last 5 minutes), away (5 to 20 minutes) or offline, plus repo, name and role for registered ones.
- get_project { project, ready: true } lists only the epics you can start: no open questions, approved specs (or none), not done, with at least one unblocked unfinished task, in the user's board order.

Tools: register_agent, list_agents, get_project, set_task_stage_status, get_last_session`;

const THREADS = `# Threads

Epic questions are threads. Ask before starting an epic when anything is unclear.

- add_epic_questions { epic, questions } opens several threads in one call; add context and suggested options. People open threads in the dashboard too.
- Messages: a thread holds replies, oldest first, in messages (get_epic). reply_to_question adds details or findings in any status; it does not resolve the thread.
- Status: open (waiting for a person), answered (follow the answer), ignored (use your own judgement). update_question { status } answers (with answer), ignores or reopens (clears the answer); it also edits the text, context or options.
- Gate: while any question of an epic is open, whoever opened it, its tasks cannot start (409 open_questions).
- Gate: when an epic has specs, its tasks cannot start until a person approves them in the epic Specs header (409 specs_not_approved). Epics without specs need no approval. Creating tasks is never blocked. Approval is one-time: later spec changes keep the epic approved.
- Thread activity by others flags the epic in your inbox.

Tools: add_epic_questions, reply_to_question, update_question, delete_question, approve_epic_specs, get_epic, get_project`;

const SPECS = `# Specs

A spec is a markdown document attached to a project, an epic or a task.

- Project specs hold context for every epic: architecture, conventions, product goals. get_project returns them: read them before planning. Epic and task specs hold plans for that work (get_epic, get_task). add_spec takes exactly one of project, epic or task.
- Specs are for plans, designs and reference. Content the user must act on (a script to run, commands, manual steps) goes in the task description, not in a spec.
- brief is required over MCP whenever you create a spec or change its content: a plain-language summary for non-engineers (summary, whyItMatters, whatChanges, acceptance, risks, openQuestions, glossary, effort S/M/L/XL, readingMinutes). Write it for the user's profile (at the end of the MCP instructions), describe outcomes not code, and never invent requirements. update_spec { spec, brief } rewrites it alone.
- Diagrams: use mermaid code blocks (flowchart, sequenceDiagram, stateDiagram-v2, erDiagram, gantt...); the dashboard renders them.
- Images: upload_attachment sends a PNG, JPEG, GIF or WebP up to 10 MB as base64 and returns markdown to embed in specs, task descriptions and comments. To see an image, list_attachments then get_attachment.
- Versions: every content change keeps the previous version; people read the history in the dashboard.
- create_epic accepts tasks and specs in one call.

Tools: add_spec, get_spec, update_spec, delete_spec, upload_attachment, list_attachments, get_attachment, create_epic, approve_epic_specs`;

const TICKETS = `# External tickets

Projects can link to Jira, GitHub, Linear, Plane or a webhook through a ticketing connection (set up in Settings; those tools are listed with /mcp?tools=all).

- With ticket sync on for the project, Briefline pushes automatically: epic and task changes and stage moves, new and edited task descriptions, task comments and cancellations. You do not call anything for this.
- With pulling on, status, title, description and new comments of linked tickets come back into Briefline on an interval.
- Epics and tasks keep their linked ticket in externalRef.
- find_tickets { query } matches a project key, epic key, task key, the key of a linked external ticket (SOFT1-693, #123) or a title, and returns the dashboard path of each hit.
- Each push is a sync job that can fail; people retry it in Settings.

Tools: find_tickets, update_epic, update_task`;

const TOPIC_TEXT: Record<HowToTopic, string> = {
	overview: OVERVIEW,
	workflow: MCP_INSTRUCTIONS,
	inbox: INBOX,
	agents: AGENTS,
	threads: THREADS,
	specs: SPECS,
	tickets: TICKETS
};

const TOPIC_SUMMARY: Record<HowToTopic, string> = {
	overview: 'projects, epics, tasks, stages, people, agents, profile, sessions',
	workflow: 'the step-by-step flow an agent follows',
	inbox: 'what others changed since you last acknowledged it',
	agents: 'register_agent, names, claiming tasks, the meanwhile block, presence',
	threads: 'epic questions, replies, and the gates that block starting tasks',
	specs: 'project, epic and task specs, the brief, diagrams, attachments, versions',
	tickets: 'Jira, GitHub, Linear, Plane and webhook sync'
};

export function howTo(topic?: HowToTopic): string {
	if (topic) return TOPIC_TEXT[topic];
	const list = HOW_TO_TOPICS.map((name) => `- ${name}: ${TOPIC_SUMMARY[name]}`).join('\n');
	return `${OVERVIEW}\n\nTopics (how_to { topic }):\n${list}`;
}
