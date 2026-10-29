import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { isAuthorized } from '#lib/server/http/auth.ts';
import { errorResponse } from '#lib/server/http/responses.ts';
import { isValidSession, SESSION_COOKIE } from '#lib/server/http/session.ts';
import { apiToken } from '#lib/server/runtime.ts';

const isMachineEndpoint = (path: string) => path.startsWith('/api/') || path === '/mcp';

export const handle: Handle = async ({ event, resolve }) => {
	const token = apiToken();
	const path = event.url.pathname;

	if (!isMachineEndpoint(path)) {
		// With PM_API_TOKEN set, the dashboard asks for the same token once and keeps a session cookie.
		if (token && path !== '/login' && !isValidSession(event.cookies.get(SESSION_COOKIE), token)) {
			redirect(303, `/login?next=${encodeURIComponent(path + event.url.search)}`);
		}
		return resolve(event);
	}

	// Agents do not send Origin; browsers do. A foreign Origin means another site is calling us.
	const origin = event.request.headers.get('origin');
	if (origin && origin !== event.url.origin) {
		return errorResponse(403, 'forbidden_origin', `Requests from ${origin} are not allowed`);
	}
	if (!isAuthorized(event.request.headers, token)) {
		return errorResponse(
			401,
			'unauthorized',
			'Send the API token as "Authorization: Bearer <PM_API_TOKEN>"',
			{
				'www-authenticate': 'Bearer'
			}
		);
	}
	return resolve(event);
};
