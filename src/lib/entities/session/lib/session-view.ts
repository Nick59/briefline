import { formatDate, pluralize } from '#lib/shared/lib/format.ts';
import type { SessionRecap, SessionSummary } from '#lib/shared/domain/types.ts';

const ACTIVE_WINDOW_MS = 10 * 60_000;

/** A session counts as active while it has not ended and made a request in the last 10 minutes. */
export const isSessionActive = (
	session: Pick<SessionSummary, 'endedAt' | 'lastSeenAt'>,
	now = Date.now()
) => !session.endedAt && now - Date.parse(session.lastSeenAt) < ACTIVE_WINDOW_MS;

export function durationLabel(startedAt: string, endedAt: string): string {
	const minutes = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000);
	if (minutes < 1) return 'under a minute';
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export function dayLabel(iso: string, now = new Date()): string {
	const date = new Date(iso);
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (dayKey(date) === dayKey(now)) return 'Today';
	if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
	return formatDate(iso, date.getFullYear() !== now.getFullYear());
}

/** Groups sessions that are already newest first by the local day they started on. */
export function groupByDay<T extends Pick<SessionSummary, 'startedAt'>>(
	sessions: T[],
	now = new Date()
): { label: string; sessions: T[] }[] {
	const groups: { key: string; label: string; sessions: T[] }[] = [];
	for (const session of sessions) {
		const key = dayKey(new Date(session.startedAt));
		const last = groups.at(-1);
		if (last?.key === key) last.sessions.push(session);
		else groups.push({ key, label: dayLabel(session.startedAt, now), sessions: [session] });
	}
	return groups;
}

/** The non-zero parts of a recap as short labels, such as "3 tasks done". */
export function recapChips(recap: SessionRecap): string[] {
	const specs = recap.specsAdded + recap.specsUpdated;
	const chips: [number, string, string?][] = [
		[recap.tasksDone, 'task done', 'tasks done'],
		[recap.stageChanges, 'stage change'],
		[recap.tasksCreated, 'task created', 'tasks created'],
		[recap.epicsCreated, 'epic created', 'epics created'],
		[specs, 'spec'],
		[recap.threadsOpened, 'thread opened', 'threads opened'],
		[recap.replies, 'reply', 'replies'],
		[recap.answers, 'answer']
	];
	return chips
		.filter(([count]) => count > 0)
		.map(([count, one, many]) => pluralize(count, one, many));
}

/** The first non-empty lines of a markdown summary, for cards. */
export function summaryPreview(summary: string, lines = 3): string {
	return summary
		.split('\n')
		.filter((line) => line.trim())
		.slice(0, lines)
		.join('\n');
}
