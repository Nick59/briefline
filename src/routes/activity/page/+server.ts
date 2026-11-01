import type { RequestHandler } from './$types';
import { app } from '#lib/server/runtime.ts';
import { readActivityPage } from '#lib/server/http/activity-page.ts';
import { DomainError } from '#lib/server/core/errors.ts';

/** One page of activity for the dashboard's lists. It sits outside /api, so the dashboard session cookie guards it. */
export const GET: RequestHandler = ({ url }) => {
	try {
		return Response.json(readActivityPage(app(), url.searchParams), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		if (error instanceof DomainError) {
			return Response.json(
				{ error: { code: error.code, message: error.message } },
				{ status: error.status }
			);
		}
		throw error;
	}
};
