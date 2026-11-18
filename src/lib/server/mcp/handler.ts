import type { Container } from '../container.ts';
import { execute, toFailure } from '../api/execute.ts';
import { inputJsonSchema } from '../api/openapi.ts';
import type { McpContent, Operation } from '../api/operation.ts';
import { codingLevelPhrase, roleLabel } from '#lib/shared/domain/profile-guidance.ts';
import { operations, operationsByName } from '../api/operations.ts';
import { MCP_INSTRUCTIONS } from '../modules/guide/how-to.ts';
import { currentSessionId, runInRequestContext } from '../core/request-context.ts';

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];

export function instructionsFor(app: Container): string {
	const { profile, guidance } = app.profile.view();
	if (!profile) return MCP_INSTRUCTIONS;
	return `${MCP_INSTRUCTIONS}\n\nUser: ${profile.name}, ${roleLabel(profile)}, ${codingLevelPhrase(profile.codingLevel)}${profile.language ? `, prefers ${profile.language}` : ''}. Guidance: ${guidance}`;
}

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id?: string | number | null;
	method: string;
	params?: Record<string, unknown>;
}

type JsonRpcResponse = { jsonrpc: '2.0'; id: string | number | null } & (
	{ result: unknown } | { error: { code: number; message: string } }
);

export interface McpOptions {
	/** Lists the hidden setup and admin tools too; they are callable either way. */
	allTools?: boolean;
}

const DROPPED_KEYWORDS = new Set(['$schema', 'maxLength', 'minLength', 'format']);
const SCHEMA_MAPS = new Set(['properties', '$defs', 'definitions']);
const isUnboundedInteger = (value: unknown) =>
	typeof value === 'number' && Math.abs(value) === Number.MAX_SAFE_INTEGER;

/** Drops validation keywords the server re-checks with zod anyway, to keep tools/list small. */
export function compactSchema(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(compactSchema);
	if (node === null || typeof node !== 'object') return node;
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node)) {
		if (DROPPED_KEYWORDS.has(key)) continue;
		if ((key === 'minimum' || key === 'maximum') && isUnboundedInteger(value)) continue;
		out[key] = SCHEMA_MAPS.has(key)
			? Object.fromEntries(
					Object.entries(value as object).map(([name, child]) => [name, compactSchema(child)])
				)
			: compactSchema(value);
	}
	return out;
}

function toolInputSchema(op: Operation) {
	const schema = compactSchema(inputJsonSchema(op.input)) as ReturnType<typeof inputJsonSchema>;
	const required = [...new Set([...(schema.required ?? []), ...(op.mcp?.required ?? [])])];
	return required.length ? { ...schema, required } : schema;
}

function tools(options: McpOptions) {
	return operations
		.filter((op) => !op.mcp?.excluded && (options.allTools || !op.mcp?.hidden))
		.map((op) => ({
			name: op.name,
			description: [op.summary, op.description].filter(Boolean).join('\n'),
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
	if (!op || op.mcp?.excluded)
		return { error: { code: -32602, message: `Unknown tool '${String(params.name)}'` } };
	try {
		const value = await execute(app, op, params.arguments ?? {}, { actor, transport: 'mcp' });
		const structured =
			value !== null && typeof value === 'object' && !Array.isArray(value)
				? value
				: { items: value };
		const content: McpContent[] = op.mcp?.content?.(value) ?? [
			{ type: 'text', text: JSON.stringify(value, null, 2) }
		];
		if (op.mcp?.content && 'data' in structured) delete (structured as { data?: unknown }).data;
		return {
			result: {
				content,
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
	actor: string,
	options: McpOptions
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
			return reply({ result: { tools: tools(options) } });
		case 'tools/call': {
			const called = await callTool(app, request.params ?? {}, actor);
			const sessionId = currentSessionId();
			const meanwhile =
				sessionId && called.result
					? app.sessions.meanwhile(sessionId, app.sessions.actorOf(sessionId) ?? actor)
					: null;
			if (meanwhile)
				called.result?.content.push({ type: 'text', text: JSON.stringify({ meanwhile }, null, 2) });
			return reply(called);
		}
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

async function dispatchAll(
	app: Container,
	payload: unknown,
	actor: string,
	options: McpOptions
): Promise<unknown> {
	if (Array.isArray(payload)) {
		const responses = [];
		for (const message of payload) {
			const response = isValid(message)
				? await dispatch(app, message, actor, options)
				: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } };
			if (response) responses.push(response);
		}
		return responses.length ? responses : null;
	}
	if (!isValid(payload))
		return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } };
	return dispatch(app, payload, actor, options);
}

/**
 * Handles one JSON-RPC message or a batch inside the agent's session: `initialize` opens a new one,
 * any other request joins the session named by the Mcp-Session-Id header, created here if unknown.
 */
export async function handleMcpRequest(
	app: Container,
	payload: unknown,
	actor: string,
	sessionHeader?: string | null,
	options: McpOptions = {}
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
	if (sessionId) actor = app.sessions.actorOf(sessionId) ?? actor;
	const body = await runInRequestContext({ sessionId }, () =>
		dispatchAll(app, payload, actor, options)
	);
	return { body, newSessionId };
}

/** Handles one JSON-RPC message or a batch outside any session. Returns null when nothing needs a response. */
export async function handleMcp(
	app: Container,
	payload: unknown,
	actor: string,
	options: McpOptions = {}
): Promise<unknown> {
	return dispatchAll(app, payload, actor, options);
}
