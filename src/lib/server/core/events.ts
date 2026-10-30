import { currentTransport } from './operation-context.ts';
import type { Stage, WorkStatus } from '#lib/shared/domain/constants.ts';

export type Transport = 'mcp';

interface Scope {
	projectId: string;
	epicId: string | null;
	taskId: string | null;
	actor: string;
	/** Set from the operation that caused the event; absent for dashboard and background work. */
	transport?: Transport;
}

export type DomainEvent = Scope &
	(
		| { type: 'project.created' | 'project.updated'; data: { name: string } }
		| {
				type: 'epic.created' | 'epic.updated' | 'epic.deleted';
				data: { key: string; title: string; fields?: string[] };
		  }
		| {
				type: 'task.created' | 'task.updated' | 'task.deleted';
				data: { key: string; title: string; fields?: string[] };
		  }
		| {
				type: 'task.stage_changed';
				data: {
					key: string;
					title: string;
					stage: Stage;
					from: WorkStatus;
					to: WorkStatus;
					note?: string;
				};
		  }
		| {
				type: 'spec.created' | 'spec.updated' | 'spec.deleted' | 'spec.translated';
				/** key is the task key for a task spec, else the epic key. */
				data: { key?: string; title: string };
		  }
		| {
				type: 'ticket.synced' | 'ticket.sync_failed';
				data: { provider: string; key: string; error?: string };
		  }
	);

export type DomainEventType = DomainEvent['type'];
type Listener = (event: DomainEvent) => void;

export class EventBus {
	#listeners = new Set<Listener>();

	subscribe(listener: Listener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	emit(raw: DomainEvent) {
		const transport = raw.transport ?? currentTransport();
		const event = transport ? { ...raw, transport } : raw;
		for (const listener of this.#listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error(`[events] listener failed for ${event.type}`, error);
			}
		}
	}
}
