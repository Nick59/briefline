import { toast } from 'svelte-sonner';
import { STAGE_LABELS, type Stage } from '#lib/shared/domain/constants.ts';
import type { LiveEvent } from '#lib/shared/domain/live.ts';

export function notifyAgentEvent(event: LiveEvent) {
	const id = `task:${event.key ?? event.taskId ?? event.type}`;
	if (event.type === 'task.stage_changed') {
		const stage = STAGE_LABELS[event.data.stage as Stage] ?? String(event.data.stage);
		toast(`Claude moved ${event.key} → ${stage}`, { id });
	} else if (event.type === 'spec.created') {
		toast(`Claude added spec "${event.title}"`, { id });
	} else if (event.type === 'ticket.sync_failed') {
		toast.error(event.message, { id, duration: Infinity });
	}
}
