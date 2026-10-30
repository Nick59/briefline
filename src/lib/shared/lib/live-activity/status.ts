export type LiveStatus = 'active' | 'recent' | 'idle' | 'offline';
export type Connection = 'connecting' | 'open' | 'closed';

export const ACTIVE_MS = 10_000;
export const RECENT_MS = 5 * 60_000;
export const HIGHLIGHT_MS = 2_000;

export function liveStatus(
	connection: Connection,
	lastAgentAt: number | null,
	now: number
): LiveStatus {
	if (connection === 'closed') return 'offline';
	if (lastAgentAt === null) return 'idle';
	const age = now - lastAgentAt;
	if (age < ACTIVE_MS) return 'active';
	if (age < RECENT_MS) return 'recent';
	return 'idle';
}

export const isRecentlyChanged = (changedAt: number | undefined, now: number) =>
	changedAt !== undefined && now - changedAt < HIGHLIGHT_MS;
