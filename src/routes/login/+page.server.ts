import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiToken } from '#lib/server/runtime.ts';
import { isAuthorized } from '#lib/server/http/auth.ts';
import { SESSION_COOKIE, sessionValue } from '#lib/server/http/session.ts';

const safeNext = (value: unknown) =>
	typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';

export const load: PageServerLoad = ({ url }) => {
	if (!apiToken()) redirect(303, '/');
	return { next: safeNext(url.searchParams.get('next')) };
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const token = apiToken();
		const form = await request.formData();
		const next = safeNext(form.get('next'));
		if (!token) redirect(303, next);
		const headers = new Headers({ authorization: `Bearer ${String(form.get('token') ?? '')}` });
		if (!isAuthorized(headers, token)) return fail(401, { error: 'That token is not valid.' });
		cookies.set(SESSION_COOKIE, sessionValue(token), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: 60 * 60 * 24 * 30
		});
		redirect(303, next);
	}
};
