import type { Stage, WorkStatus } from '#lib/shared/domain/constants.ts';

interface Scope {
	projectId: string;
	epicId: string | null;
	taskId: string | null;
	actor: string;
}

export type DomainEvent = Scope &
	(
		| { type: 'project.created' | 'project.updated'; data: { name: string } }
		| {
				type: 'epic.created' | 'epic.updated' | 'epic.deleted';
				data: { key: string; title: string; fields?: string[] };
		  }
		| {
				type: 'phase.created' | 'phase.updated' | 'phase.deleted';
				data: { name: string; fields?: string[] };
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
				data: { title: string };
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

	emit(event: DomainEvent) {
		for (const listener of this.#listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error(`[events] listener failed for ${event.type}`, error);
			}
		}
	}
}
