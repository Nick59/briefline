import type { Container } from '../container.ts';
import { execute, toFailure } from '../api/execute.ts';
import { inputJsonSchema } from '../api/openapi.ts';
import { operations, operationsByName } from '../api/operations.ts';

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];

export const MCP_INSTRUCTIONS = `AI Project Manager tracks software work for humans.
Model: Project > Epic > Task. Each epic has a vertical timeline of phases; each task belongs to at most one phase.
Every task moves through three stages: dev, test, deploy. Each stage is todo, in_progress or done.
Typical flow for an agent:
1. list_projects, then get_epic to read the plan and the current board.
2. When you plan new work, call create_epic with phases, tasks and specs in one call.
3. As you work, call set_task_stage_status (e.g. stage=dev status=in_progress, then done; then test...).
4. Attach your specs/plans as markdown with add_epic_spec or add_task_spec, then translate_spec so humans get a plain-language brief.
   Add diagrams as \`\`\`mermaid code blocks (flowchart, sequenceDiagram, stateDiagram-v2, erDiagram, gantt...); the dashboard renders them.
Linked tickets in Jira, GitHub, Linear or a webhook are updated automatically when ticket sync is on.
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

function tools() {
	return operations.map((op) => ({
		name: op.name,
		title: op.summary,
		description: [op.summary, op.description, `REST: ${op.method} /api/v1${op.path}`]
			.filter(Boolean)
			.join('\n'),
		inputSchema: inputJsonSchema(op.input),
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
		const value = await execute(app, op, params.arguments ?? {}, { actor });
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
					serverInfo: { name: 'ai-project-manager', title: 'AI Project Manager', version: '1.0.0' },
					instructions: MCP_INSTRUCTIONS
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

/** Handles one JSON-RPC message or a batch. Returns null when nothing needs a response. */
export async function handleMcp(app: Container, payload: unknown, actor: string): Promise<unknown> {
	const isValid = (m: unknown): m is JsonRpcRequest =>
		typeof m === 'object' &&
		m !== null &&
		(m as JsonRpcRequest).jsonrpc === '2.0' &&
		typeof (m as JsonRpcRequest).method === 'string';

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
