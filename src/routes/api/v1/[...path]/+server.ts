import type { RequestHandler } from './$types';
import { actorFrom, execute } from '#lib/server/api/execute.ts';
import { matchRoute } from '#lib/server/api/router.ts';
import { errorResponse, readJsonBody } from '#lib/server/http/responses.ts';
import { app } from '#lib/server/runtime.ts';

const handle: RequestHandler = async ({ request, params, url }) => {
	const match = matchRoute(request.method, `/${params.path}`);
	if (!match)
		return errorResponse(
			404,
			'not_found',
			`No API route for ${request.method} /api/v1/${params.path}`
		);
	if ('allowed' in match) {
		return errorResponse(405, 'method_not_allowed', `Use ${match.allowed.join(', ')}`, {
			allow: match.allowed.join(', ')
		});
	}

	let body: unknown = {};
	if (request.method !== 'GET' && request.method !== 'DELETE') {
		try {
			body = await readJsonBody(request);
		} catch (error) {
			return errorResponse(400, 'invalid_json', (error as Error).message);
		}
		if (typeof body !== 'object' || body === null || Array.isArray(body)) {
			return errorResponse(400, 'invalid_json', 'The request body must be a JSON object');
		}
	}

	const input = { ...Object.fromEntries(url.searchParams), ...(body as object), ...match.params };
	try {
		const result = await execute(app(), match.op, input, {
			actor: actorFrom(request.headers, 'api')
		});
		return Response.json(result, { status: match.op.successStatus ?? 200 });
	} catch (error) {
		const failure = error as { status: number; body: unknown };
		return Response.json(failure.body, { status: failure.status });
	}
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
