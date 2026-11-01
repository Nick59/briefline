import type { Container } from '../container.ts';
import { execute, toFailure } from '../api/execute.ts';
import { inputJsonSchema } from '../api/openapi.ts';
import type { Operation } from '../api/operation.ts';
import { codingLevelPhrase, roleLabel } from '#lib/shared/domain/profile-guidance.ts';
import { operations, operationsByName } from '../api/operations.ts';
import { runInRequestContext } from '../core/request-context.ts';

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];

export function instructionsFor(app: Container): string {
	const { profile, guidance } = app.profile.view();
	if (!profile) return MCP_INSTRUCTIONS;
	return `${MCP_INSTRUCTIONS}\n\nUser: ${profile.name}, ${roleLabel(profile)}, ${codingLevelPhrase(profile.codingLevel)}${profile.language ? `, prefers ${profile.language}` : ''}. Guidance: ${guidance}`;
}

export const MCP_INSTRUCTIONS = `Briefline tracks software work for humans.
Model: Project > Epic > Task.
Every task moves through three stages: dev, test, deploy. Each stage is todo, in_progress or done.
Typical flow for an agent:
0. At the start of a session, and before resuming work, call get_last_session (with the project when you know it) to read what the previous session did, and get_activity_changes to see what people changed since your last pull (answered questions, moved tasks, edited specs).
   Read get_user_profile and adapt your tone and every spec \`brief\` to the user's role and coding level.
1. list_projects, then get_epic to read the plan and the current board.
2. When you plan new work, call create_epic with tasks and specs in one call.
   Before starting work on an epic, ask anything unclear with add_epic_questions (one call, several questions; add context and suggested options).
   Questions are threads: a person can open one too, and anyone can add replies over time. Read the replies in each question's \`messages\` (list_epic_questions or get_epic), reply or act on threads a person opened, and add details or findings with reply_to_question.
   Tasks cannot be started while an epic has open questions, whoever opened them. Read the answers and follow them; an ignored question means use your judgement.
3. As you work, call set_task_stage_status (e.g. stage=dev status=in_progress, then done; then test...).
   Read a task's comments in get_task; people comment too, so act on their comments, and use add_task_comment to record findings, decisions or blockers on the task as you work.
4. Attach your specs/plans as markdown with add_project_spec, add_epic_spec or add_task_spec, always including the \`brief\` argument:
   the plain-language summary for non-engineers is written by you, in the same call (set_spec_brief rewrites it alone).
   Project-wide context (architecture, conventions, product goals) goes in project specs via add_project_spec; read it with list_project_specs before planning.
   Add diagrams as \`\`\`mermaid code blocks (flowchart, sequenceDiagram, stateDiagram-v2, erDiagram, gantt...); the dashboard renders them.
Linked tickets in Jira, GitHub, Linear, Plane or a webhook are updated automatically when ticket sync is on.
5. Before you end your work, call set_session_summary with a short plain-language recap of what this session did, written for the user's profile. Call it again after later chunks of work; it overwrites the previous summary.
Ids and keys are interchangeable: PMA, PMA-E1 and PMA-12 work wherever an id is expected.`;

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id?: string | number | null;
	method: string;
	params?: Record<string, unknown>;
}

type JsonRpcResponse = { jsonrpc: '2.0'; id: string | number | null } & (
	{ result: unknown } | { error: { code: number; message: string } }
);

function toolInputSchema(op: Operation) {
	const schema = inputJsonSchema(op.input);
	const required = [...new Set([...(schema.required ?? []), ...(op.mcp?.required ?? [])])];
	return required.length ? { ...schema, required } : schema;
}

function tools() {
	return operations.map((op) => ({
		name: op.name,
		title: op.summary,
		description: [op.summary, op.description, `REST: ${op.method} /api/v1${op.path}`]
			.filter(Boolean)
			.join('\n'),
		inputSchema: toolInputSchema(op),
		annotations: {
			readOnlyHint: op.readOnly,
			destructiveHint: op.method === 'DELETE',
			idempotentHint: op.method !== 'POST'
		}
	}));
}

async function callTool(app: Container, params: Record<string, unknown>, actor: string) {
	const op = operationsByName.get(String(params.name));
	if (!op) return { error: { code: -32602, message: `Unknown tool '${String(params.name)}'` } };
	try {
		const value = await execute(app, op, params.arguments ?? {}, { actor, transport: 'mcp' });
		const structured =
			value !== null && typeof value === 'object' && !Array.isArray(value)
				? value
				: { items: value };
		return {
			result: {
				content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
				structuredContent: structured
			}
		};
	} catch (error) {
		const failure = toFailure(error);
		return {
			result: { content: [{ type: 'text', text: failure.body.error.message }], isError: true }
		};
	}
}

async function dispatch(
	app: Container,
	request: JsonRpcRequest,
	actor: string
): Promise<JsonRpcResponse | null> {
	app.presence.touch(actor, 'mcp');
	const id = request.id ?? null;
	const isNotification = request.id === undefined;
	const reply = (body: { result: unknown } | { error: { code: number; message: string } }) =>
		isNotification ? null : ({ jsonrpc: '2.0', id, ...body } as JsonRpcResponse);

	switch (request.method) {
		case 'initialize': {
			const requested = String(request.params?.protocolVersion ?? '');
			return reply({
				result: {
					protocolVersion: SUPPORTED_VERSIONS.includes(requested)
						? requested
						: SUPPORTED_VERSIONS[0],
					capabilities: { tools: { listChanged: false } },
					serverInfo: { name: 'briefline', title: 'Briefline', version: '1.0.0' },
					instructions: instructionsFor(app)
				}
			});
		}
		case 'ping':
			return reply({ result: {} });
		case 'tools/list':
			return reply({ result: { tools: tools() } });
		case 'tools/call':
			return reply(await callTool(app, request.params ?? {}, actor));
		default:
			if (request.method.startsWith('notifications/')) return null;
			return reply({
				error: { code: -32601, message: `Method '${request.method}' is not supported` }
			});
	}
}

const SESSION_ID_PATTERN = /^[\w.:-]{1,100}$/;

/** A client-chosen id is only trusted when it is a plain token; anything else is treated as no session. */
export const validSessionId = (id: string | null | undefined): string | null =>
	id && SESSION_ID_PATTERN.test(id) ? id : null;

export interface McpReply {
	body: unknown;
	/** Set when the server opened a session; the transport returns it in the Mcp-Session-Id header. */
	newSessionId: string | null;
}

const isValid = (m: unknown): m is JsonRpcRequest =>
	typeof m === 'object' &&
	m !== null &&
	(m as JsonRpcRequest).jsonrpc === '2.0' &&
	typeof (m as JsonRpcRequest).method === 'string';

const clientInfoOf = (request: JsonRpcRequest) => {
	const info = request.params?.clientInfo;
	if (typeof info !== 'object' || info === null) return {};
	const { name, version } = info as Record<string, unknown>;
	return {
		name: typeof name === 'string' ? name.slice(0, 100) : null,
		version: typeof version === 'string' ? version.slice(0, 100) : null
	};
};

async function dispatchAll(app: Container, payload: unknown, actor: string): Promise<unknown> {
	if (Array.isArray(payload)) {
		const responses = [];
		for (const message of payload) {
			const response = isValid(message)
				? await dispatch(app, message, actor)
				: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } };
			if (response) responses.push(response);
		}
		return responses.length ? responses : null;
	}
	if (!isValid(payload))
		return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } };
	return dispatch(app, payload, actor);
}

/**
 * Handles one JSON-RPC message or a batch inside the agent's session: `initialize` opens a new one,
 * any other request joins the session named by the Mcp-Session-Id header, created here if unknown.
 */
export async function handleMcpRequest(
	app: Container,
	payload: unknown,
	actor: string,
	sessionHeader?: string | null
): Promise<McpReply> {
	const messages = Array.isArray(payload) ? payload : [payload];
	const init = messages.find((m): m is JsonRpcRequest => isValid(m) && m.method === 'initialize');
	let sessionId = validSessionId(sessionHeader);
	let newSessionId: string | null = null;
	if (init) {
		sessionId = newSessionId = app.sessions.start(actor, clientInfoOf(init));
	} else if (sessionId) {
		app.sessions.touch(sessionId, actor);
	}
	const body = await runInRequestContext({ sessionId }, () => dispatchAll(app, payload, actor));
	return { body, newSessionId };
}

/** Handles one JSON-RPC message or a batch outside any session. Returns null when nothing needs a response. */
export async function handleMcp(app: Container, payload: unknown, actor: string): Promise<unknown> {
	return dispatchAll(app, payload, actor);
}
