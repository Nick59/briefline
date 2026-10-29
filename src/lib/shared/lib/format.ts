const units: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 31_536_000],
	['month', 2_592_000],
	['week', 604_800],
	['day', 86_400],
	['hour', 3_600],
	['minute', 60]
];
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function relativeTime(iso: string, now = Date.now()): string {
	const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
	for (const [unit, size] of units) {
		if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
	}
	return 'just now';
}

const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const dateYearFormat = new Intl.DateTimeFormat('en', {
	month: 'short',
	day: 'numeric',
	year: 'numeric'
});

/** Formats YYYY-MM-DD or ISO timestamps without timezone shifts for plain dates. */
export function formatDate(value: string | null | undefined, withYear = false): string {
	if (!value) return '';
	const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
	return (withYear ? dateYearFormat : dateFormat).format(date);
}

export function formatDateRange(start: string | null, end: string | null): string {
	if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
	if (start) return `From ${formatDate(start)}`;
	if (end) return `Until ${formatDate(end)}`;
	return '';
}

export function daysUntil(date: string, now = new Date()): number {
	const target = new Date(`${date}T12:00:00`);
	return Math.round((target.getTime() - now.getTime()) / 86_400_000);
}

export function pluralize(count: number, word: string, plural = `${word}s`) {
	return `${count} ${count === 1 ? word : plural}`;
}
