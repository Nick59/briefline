import { toast } from 'svelte-sonner';
import { STAGE_LABELS, type Stage } from '#lib/shared/domain/constants.ts';
import { commentPhrase, isCommentEvent } from '#lib/shared/lib/comment-text.ts';
import { questionPhrase } from '#lib/shared/lib/question-text.ts';
import type { LiveEvent } from '#lib/shared/domain/live.ts';

export function notifyAgentEvent(event: LiveEvent) {
	const id = `task:${event.key ?? event.taskId ?? event.type}`;
	if (event.type === 'task.stage_changed') {
		const stage = STAGE_LABELS[event.data.stage as Stage] ?? String(event.data.stage);
		toast(`${event.actor} moved ${event.key} → ${stage}`, { id });
	} else if (event.type === 'spec.created') {
		toast(`${event.actor} added spec "${event.title}"`, { id });
	} else if (isCommentEvent(event.type)) {
		const phrase = commentPhrase(event.type, event.key, event.title);
		toast(`${event.actor} ${phrase[0].toLowerCase()}${phrase.slice(1)}`, { id });
	} else if (event.type.startsWith('question.')) {
		const phrase = questionPhrase(event.type, event.data, { key: event.key });
		if (phrase) toast(`${event.actor} ${phrase[0].toLowerCase()}${phrase.slice(1)}`, { id });
	} else if (event.type === 'ticket.sync_failed') {
		toast.error(event.message, { id, duration: Infinity });
	}
}
