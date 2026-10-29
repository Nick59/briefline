import { timingSafeEqual } from 'node:crypto';

/** True when no token is configured, or when the request carries it as a Bearer token. */
export function isAuthorized(headers: Headers, token: string | null): boolean {
	if (!token) return true;
	const provided = headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
	const a = Buffer.from(provided);
	const b = Buffer.from(token);
	return a.length === b.length && timingSafeEqual(a, b);
}
