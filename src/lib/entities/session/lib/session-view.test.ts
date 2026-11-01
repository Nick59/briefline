import { describe, expect, it } from 'vitest';
import {
	dayLabel,
	durationLabel,
	groupByDay,
	isSessionActive,
	recapChips,
	summaryPreview
} from './session-view.ts';

const noon = (day: number) => new Date(2026, 10, day, 12).toISOString();
const now = new Date(2026, 10, 10, 15);

describe('session view helpers', () => {
	it('labels Today, Yesterday and older days', () => {
		expect(dayLabel(noon(10), now)).toBe('Today');
		expect(dayLabel(noon(9), now)).toBe('Yesterday');
		expect(dayLabel(noon(3), now)).toBe('Nov 3');
		expect(dayLabel(new Date(2025, 10, 3, 12).toISOString(), now)).toBe('Nov 3, 2025');
	});

	it('groups consecutive sessions by day', () => {
		const sessions = [
			{ startedAt: noon(10) },
			{ startedAt: noon(10) },
			{ startedAt: noon(9) },
			{ startedAt: noon(3) }
		];
		expect(groupByDay(sessions, now).map((g) => [g.label, g.sessions.length])).toEqual([
			['Today', 2],
			['Yesterday', 1],
			['Nov 3', 1]
		]);
	});

	it('is active until it ends or goes quiet for 10 minutes', () => {
		const at = Date.parse('2026-11-10T10:00:00Z');
		const seen = (minutes: number) => new Date(at - minutes * 60_000).toISOString();
		expect(isSessionActive({ endedAt: null, lastSeenAt: seen(9) }, at)).toBe(true);
		expect(isSessionActive({ endedAt: null, lastSeenAt: seen(10) }, at)).toBe(false);
		expect(isSessionActive({ endedAt: seen(1), lastSeenAt: seen(1) }, at)).toBe(false);
	});

	it('formats durations', () => {
		const start = '2026-11-10T10:00:00Z';
		expect(durationLabel(start, '2026-11-10T10:00:20Z')).toBe('under a minute');
		expect(durationLabel(start, '2026-11-10T10:42:00Z')).toBe('42 min');
		expect(durationLabel(start, '2026-11-10T11:00:00Z')).toBe('1 h');
		expect(durationLabel(start, '2026-11-10T12:05:00Z')).toBe('2 h 5 min');
	});

	it('lists only the non-zero recap parts', () => {
		const recap = {
			stageChanges: 4,
			tasksDone: 3,
			tasksCreated: 0,
			epicsCreated: 1,
			specsAdded: 1,
			specsUpdated: 1,
			threadsOpened: 1,
			replies: 0,
			answers: 0,
			images: 0
		};
		expect(recapChips(recap)).toEqual([
			'3 tasks done',
			'4 stage changes',
			'1 epic created',
			'2 specs',
			'1 thread opened'
		]);
	});

	it('keeps the first non-empty summary lines', () => {
		expect(summaryPreview('a\n\nb\nc\nd', 3)).toBe('a\nb\nc');
	});
});
