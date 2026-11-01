import { PRESENCE_OFFLINE_MS, PRESENCE_ONLINE_MS } from './constants.ts';

export type PresenceStatus = 'online' | 'away' | 'offline';
export type PresenceTransport = 'mcp' | 'api';

export interface AgentPresence {
	actor: string;
	/** ISO timestamp of the latest request. */
	lastSeenAt: string;
	transport: PresenceTransport;
}

/** The presence list as sent to the dashboard; serverTime lets the browser correct for clock differences. */
export interface PresenceSnapshot {
	serverTime: string;
	agents: AgentPresence[];
}

export function presenceStatus(lastSeenAt: string | number, now: number): PresenceStatus {
	const age = now - (typeof lastSeenAt === 'number' ? lastSeenAt : Date.parse(lastSeenAt));
	if (age < PRESENCE_ONLINE_MS) return 'online';
	if (age < PRESENCE_OFFLINE_MS) return 'away';
	return 'offline';
}
