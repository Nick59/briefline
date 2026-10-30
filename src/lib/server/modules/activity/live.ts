import type { LiveEvent } from '#lib/shared/domain/live.ts';
import type { DomainEvent } from '../../core/events.ts';
import { describeEvent } from './describe.ts';

const text = (value: unknown) => (typeof value === 'string' ? value : null);

/** Returns the wire form of an event for the live view, or null when it belongs to another project. */
export function toLiveEvent(
	event: DomainEvent,
	projectId: string,
	at: Date = new Date()
): LiveEvent | null {
	if (event.projectId !== projectId) return null;
	const data = event.data as Record<string, unknown>;
	return {
		type: event.type,
		transport: event.transport ?? null,
		actor: event.actor,
		taskId: event.taskId,
		epicId: event.epicId,
		key: text(data.key),
		title: text(data.title),
		data,
		message: describeEvent(event),
		at: at.toISOString()
	};
}

export const formatSse = (event: LiveEvent) => `data: ${JSON.stringify(event)}\n\n`;
