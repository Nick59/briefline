import type { RequestHandler } from './$types';
import { actorFrom } from '#lib/server/api/execute.ts';
import { readJsonBody } from '#lib/server/http/responses.ts';
import { handleMcp } from '#lib/server/mcp/handler.ts';
import { app } from '#lib/server/runtime.ts';

// Stateless Streamable HTTP transport: every POST carries one JSON-RPC message or a batch, answered as JSON.
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
	const response = await handleMcp(app(), payload, actorFrom(request.headers, 'mcp'));
	return response === null ? new Response(null, { status: 202 }) : Response.json(response);
};

// No server-initiated stream and no sessions in stateless mode.
export const GET: RequestHandler = () =>
	new Response(null, { status: 405, headers: { allow: 'POST' } });
export const DELETE: RequestHandler = () =>
	new Response(null, { status: 405, headers: { allow: 'POST' } });
