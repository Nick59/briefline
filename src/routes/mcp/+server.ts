import type { RequestHandler } from './$types';
import { actorFrom } from '#lib/server/api/execute.ts';
import { readJsonBody } from '#lib/server/http/responses.ts';
import { handleMcpRequest, validSessionId } from '#lib/server/mcp/handler.ts';
import { app } from '#lib/server/runtime.ts';

const SESSION_HEADER = 'mcp-session-id';

// Streamable HTTP transport without a server-initiated stream: every POST carries one JSON-RPC message
// or a batch, answered as JSON. `initialize` opens a session, returned in the Mcp-Session-Id header.
export const POST: RequestHandler = async ({ request }) => {
	let payload: unknown;
	try {
		payload = await readJsonBody(request);
	} catch {
		return Response.json(
			{ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
			{ status: 400 }
		);
	}
	const { body, newSessionId } = await handleMcpRequest(
		app(),
		payload,
		actorFrom(request.headers, 'mcp'),
		request.headers.get(SESSION_HEADER)
	);
	const headers = newSessionId ? { 'Mcp-Session-Id': newSessionId } : undefined;
	return body === null
		? new Response(null, { status: 202, headers })
		: Response.json(body, { headers });
};

export const GET: RequestHandler = () =>
	new Response(null, { status: 405, headers: { allow: 'POST, DELETE' } });

export const DELETE: RequestHandler = ({ request }) => {
	const id = validSessionId(request.headers.get(SESSION_HEADER));
	if (id) app().sessions.end(id);
	return new Response(null, { status: 204 });
};
