import type { LiveEvent } from '#lib/shared/domain/live.ts';
import { withTicketKey } from '#lib/shared/lib/ticket-key.ts';
import type { DomainEvent } from '../../core/events.ts';
import { describeEvent } from './describe.ts';

const text = (value: unknown) => (typeof value === 'string' ? value : null);

/** Returns the wire form of an event for the live view, or null when it belongs to another project. */
export function toLiveEvent(
	event: DomainEvent,
	projectId: string,
	externalKeyOf: (event: DomainEvent) => string | null,
	at: Date = new Date()
): LiveEvent | null {
	if (event.projectId !== projectId) return null;
	const data = event.data as Record<string, unknown>;
	const internalKey = text(data.key);
	const externalKey = event.type.startsWith('ticket.') ? null : externalKeyOf(event);
	return {
		type: event.type,
		transport: event.transport ?? null,
		actor: event.actor,
		taskId: event.taskId,
		epicId: event.epicId,
		key: externalKey && internalKey ? externalKey : internalKey,
		internalKey,
		title: text(data.title),
		data,
		message: withTicketKey(describeEvent(event), internalKey, externalKey),
		at: at.toISOString()
	};
}

export const formatSse = (event: LiveEvent) => `data: ${JSON.stringify(event)}\n\n`;
