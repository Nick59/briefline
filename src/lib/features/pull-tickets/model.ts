import type { PullStatus } from '#lib/shared/domain/pull-status.ts';

const MAX_ERROR = 80;

function ago(iso: string, now: number): string {
	const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	return `${Math.floor(hours / 24)} d ago`;
}

export interface PullLabel {
	text: string;
	/** The full text, for a tooltip, when `text` is shortened. */
	title: string | null;
	failed: boolean;
}

export function pullLabel(status: PullStatus, now: number): PullLabel {
	if (status.error) {
		const long = status.error.length > MAX_ERROR;
		return {
			text: `Pull failed: ${long ? `${status.error.slice(0, MAX_ERROR - 1)}…` : status.error}`,
			title: `Pull failed: ${status.error}`,
			failed: true
		};
	}
	if (!status.lastPulledAt) {
		return { text: status.running ? 'Pulling…' : 'Not pulled yet', title: null, failed: false };
	}
	const changes = status.updated === 0 ? 'no changes' : `${status.updated} updated`;
	return {
		text: `Pulled ${ago(status.lastPulledAt, now)} · ${changes}`,
		title: null,
		failed: false
	};
}
