import { STAGE_LABELS, STATUS_LABELS } from '#lib/shared/domain/constants.ts';
import { commentPhrase } from '#lib/shared/lib/comment-text.ts';
import { questionPhrase } from '#lib/shared/lib/question-text.ts';
import type { DomainEvent } from '../../core/events.ts';

const QUESTION_FALLBACK = {
	'question.updated': 'Edited',
	'question.answered': 'Answered',
	'question.ignored': 'Ignored',
	'question.reopened': 'Reopened',
	'question.replied': 'Replied in thread',
	'question.deleted': 'Removed question'
} as const;

function describeQuestion(event: Extract<DomainEvent, { type: `question.${string}` }>): string {
	const { data } = event;
	const phrase = questionPhrase(event.type, data, { key: data.key });
	if (phrase) return phrase;
	if (event.type === 'question.added') {
		return data.count && data.count > 1
			? `Asked ${data.count} questions on ${data.key}`
			: `Asked "${data.title}" on ${data.key}`;
	}
	return `${QUESTION_FALLBACK[event.type]} "${data.title}" on ${data.key}`;
}

function describeAttachment(event: Extract<DomainEvent, { type: `attachment.${string}` }>): string {
	const { filename, target, key, title } = event.data;
	const verb = event.type === 'attachment.added' ? 'Added' : 'Removed';
	const where = event.type === 'attachment.added' ? 'to' : 'from';
	let place = 'project';
	if (target.type === 'task') place = `${key} “${title}”`;
	else if (target.type === 'spec') place = `spec “${title}”`;
	return `${verb} image “${filename}” ${where} ${place}`;
}

/** One readable sentence per event, shown in the activity feed. */
export function describeEvent(event: DomainEvent): string {
	switch (event.type) {
		case 'project.created':
			return `Created project ${event.data.name}`;
		case 'project.updated':
			return `Updated project settings`;
		case 'epic.created':
			return `Created epic ${event.data.key} "${event.data.title}"`;
		case 'epic.updated':
			return `Updated ${event.data.fields?.join(', ') || 'details'} of epic ${event.data.key}`;
		case 'epic.deleted':
			return `Deleted epic ${event.data.key} "${event.data.title}"`;
		case 'task.created':
			return `Created task ${event.data.key} "${event.data.title}"`;
		case 'task.updated':
			return `Updated ${event.data.fields?.join(', ') || 'details'} of ${event.data.key}`;
		case 'task.deleted':
			return `Deleted task ${event.data.key} "${event.data.title}"`;
		case 'task.cancelled':
			return `Cancelled task ${event.data.key}${event.data.reason ? ` — ${event.data.reason}` : ''}`;
		case 'task.restored':
			return `Restored task ${event.data.key}`;
		case 'task.stage_changed':
			return `Moved ${event.data.key} to ${STAGE_LABELS[event.data.stage]} · ${STATUS_LABELS[event.data.to]}`;
		case 'task.commented':
		case 'task.comment_updated':
		case 'task.comment_deleted':
			return commentPhrase(event.type, event.data.key, event.data.title);
		case 'spec.created':
			return `Added spec "${event.data.title}"`;
		case 'spec.updated':
			return `Edited spec "${event.data.title}"`;
		case 'spec.deleted':
			return `Removed spec "${event.data.title}"`;
		case 'spec.translated':
			return `Wrote a human brief for "${event.data.title}"`;
		case 'question.added':
		case 'question.updated':
		case 'question.answered':
		case 'question.ignored':
		case 'question.reopened':
		case 'question.replied':
		case 'question.deleted':
			return describeQuestion(event);
		case 'attachment.added':
		case 'attachment.deleted':
			return describeAttachment(event);
		case 'ticket.synced':
			return `Updated ticket ${event.data.key} in ${event.data.provider}`;
		case 'ticket.sync_failed':
			return `Could not update ticket ${event.data.key} in ${event.data.provider}`;
	}
}
