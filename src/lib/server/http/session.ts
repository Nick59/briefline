import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'pm_session';

/** The session value is derived from the API token, so rotating the token signs everyone out. */
export function sessionValue(token: string): string {
	return createHmac('sha256', token).update('pm-dashboard-session').digest('hex');
}

export function isValidSession(cookie: string | undefined, token: string | null): boolean {
	if (!token) return true;
	if (!cookie) return false;
	const a = Buffer.from(cookie);
	const b = Buffer.from(sessionValue(token));
	return a.length === b.length && timingSafeEqual(a, b);
}
