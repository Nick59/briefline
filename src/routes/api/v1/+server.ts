import type { RequestHandler } from './$types';
import { operations } from '#lib/server/api/operations.ts';

export const GET: RequestHandler = ({ url }) =>
	Response.json({
		name: 'AI Project Manager API',
		openapi: `${url.origin}/api/v1/openapi.json`,
		mcp: `${url.origin}/mcp`,
		operations: operations.map((op) => ({
			name: op.name,
			method: op.method,
			path: `/api/v1${op.path}`,
			summary: op.summary
		}))
	});
