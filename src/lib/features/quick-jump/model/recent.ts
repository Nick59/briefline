import type { TicketHit } from './types.ts';

const STORAGE_KEY = 'briefline:quick-jump:recent';
const MAX_RECENT = 5;

export function readRecent(): TicketHit[] {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
		return Array.isArray(parsed)
			? parsed.filter(
					(h): h is TicketHit => typeof h?.key === 'string' && typeof h?.path === 'string'
				)
			: [];
	} catch {
		return [];
	}
}

export function rememberRecent(hit: TicketHit) {
	try {
		const next = [hit, ...readRecent().filter((h) => h.kind !== hit.kind || h.key !== hit.key)];
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_RECENT)));
	} catch {
		// Storage can be blocked; recents are a convenience only.
	}
}
