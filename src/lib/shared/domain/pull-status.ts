import type { ISODate } from './types.ts';

/** The last ticket pull of one project. Kept in memory, so it is empty after a restart. */
export interface PullStatus {
	running: boolean;
	lastPulledAt: ISODate | null;
	/** Tasks and epics changed, plus comments imported, by the last pull. */
	updated: number;
	error: string | null;
}

/** Sent over the live stream as the `pull` event. */
export interface PullMessage {
	projectId: string;
	status: PullStatus;
}
