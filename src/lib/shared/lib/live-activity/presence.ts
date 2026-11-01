import {
	presenceStatus,
	type AgentPresence,
	type PresenceStatus
} from '#lib/shared/domain/presence.ts';

export const PRESENCE_TICK_MS = 30_000;
export const PRESENCE_SHOWN = 5;

export interface PresenceRow {
	actor: string;
	status: PresenceStatus;
	text: string;
}

export function presenceText(status: PresenceStatus, lastSeenAt: string, now: number): string {
	if (status === 'online') return 'Online';
	if (status === 'offline') return 'Offline';
	const minutes = Math.max(1, Math.floor((now - Date.parse(lastSeenAt)) / 60_000));
	return `Last seen ${minutes} min ago`;
}

export function presenceRows(agents: AgentPresence[], now: number): PresenceRow[] {
	return agents.map(({ actor, lastSeenAt }) => {
		const status = presenceStatus(lastSeenAt, now);
		return { actor, status, text: presenceText(status, lastSeenAt, now) };
	});
}
