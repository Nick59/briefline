import {
	STAGE_LABELS,
	STATUS_LABELS,
	type Stage,
	type WorkStatus
} from '#lib/shared/domain/constants.ts';
import { questionPhrase } from '#lib/shared/lib/question-text.ts';
import type { LiveEvent } from '#lib/shared/domain/live.ts';

const VERBS: Record<string, string> = {
	'project.created': 'Created project',
	'project.updated': 'Updated project',
	'epic.created': 'Created epic',
	'epic.updated': 'Updated epic',
	'epic.deleted': 'Deleted epic',
	'task.created': 'Created task',
	'task.updated': 'Updated task',
	'task.deleted': 'Deleted task',
	'task.cancelled': 'Cancelled task',
	'task.restored': 'Restored task',
	'task.commented': 'Commented',
	'task.comment_updated': 'Edited comment',
	'task.comment_deleted': 'Deleted comment',
	'spec.created': 'Wrote spec',
	'spec.updated': 'Updated spec',
	'spec.deleted': 'Removed spec',
	'spec.translated': 'Wrote brief',
	'question.added': 'Asked question',
	'question.updated': 'Edited question',
	'question.answered': 'Answered question',
	'question.ignored': 'Ignored question',
	'question.reopened': 'Reopened question',
	'question.replied': 'Replied in thread',
	'question.deleted': 'Removed question',
	'attachment.added': 'Added image',
	'attachment.deleted': 'Removed image',
	'ticket.synced': 'Updated ticket',
	'ticket.sync_failed': 'Ticket update failed'
};

function verb(event: LiveEvent): string {
	if (event.type === 'task.stage_changed') {
		const stage = STAGE_LABELS[event.data.stage as Stage] ?? String(event.data.stage);
		const status = STATUS_LABELS[event.data.to as WorkStatus] ?? String(event.data.to);
		return `${stage}: ${status}`;
	}
	return questionPhrase(event.type, event.data) ?? VERBS[event.type] ?? event.message;
}

/** A short status line: the ticket key and what happened, e.g. "SOFT1-693 · Dev: Done". */
export const liveLabel = (event: LiveEvent): string =>
	event.key ? `${event.key} · ${verb(event)}` : verb(event);

/** A brief sent in the same call as its spec adds nothing to the status line. */
export const isBriefOfPrevious = (event: LiveEvent, previous: LiveEvent | undefined): boolean =>
	event.type === 'spec.translated' &&
	(previous?.type === 'spec.created' || previous?.type === 'spec.updated') &&
	previous.key === event.key &&
	previous.title === event.title;
