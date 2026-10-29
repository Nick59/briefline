import { STAGE_LABELS, STATUS_LABELS } from '#lib/shared/domain/constants.ts';
import type { DomainEvent } from '../../core/events.ts';

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
		case 'phase.created':
			return `Added phase "${event.data.name}"`;
		case 'phase.updated':
			return `Updated phase "${event.data.name}"`;
		case 'phase.deleted':
			return `Removed phase "${event.data.name}"`;
		case 'task.created':
			return `Created task ${event.data.key} "${event.data.title}"`;
		case 'task.updated':
			return `Updated ${event.data.fields?.join(', ') || 'details'} of ${event.data.key}`;
		case 'task.deleted':
			return `Deleted task ${event.data.key} "${event.data.title}"`;
		case 'task.stage_changed':
			return `Moved ${event.data.key} to ${STAGE_LABELS[event.data.stage]} · ${STATUS_LABELS[event.data.to]}`;
		case 'spec.created':
			return `Added spec "${event.data.title}"`;
		case 'spec.updated':
			return `Edited spec "${event.data.title}"`;
		case 'spec.deleted':
			return `Removed spec "${event.data.title}"`;
		case 'spec.translated':
			return `Wrote a human brief for "${event.data.title}"`;
		case 'ticket.synced':
			return `Updated ticket ${event.data.key} in ${event.data.provider}`;
		case 'ticket.sync_failed':
			return `Could not update ticket ${event.data.key} in ${event.data.provider}`;
	}
}
