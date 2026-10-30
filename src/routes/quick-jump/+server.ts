import type { RequestHandler } from './$types';
import { execute } from '#lib/server/api/execute.ts';
import { operationsByName } from '#lib/server/api/operations.ts';
import { app } from '#lib/server/runtime.ts';

/** Dashboard-side entry for find_tickets; /api/v1 needs a bearer token the browser does not hold. */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const hits = await execute(
			app(),
			operationsByName.get('find_tickets')!,
			Object.fromEntries(url.searchParams),
			{ actor: 'dashboard' }
		);
		return Response.json(hits);
	} catch (error) {
		const failure = error as { status: number; body: unknown };
		return Response.json(failure.body, { status: failure.status });
	}
};
