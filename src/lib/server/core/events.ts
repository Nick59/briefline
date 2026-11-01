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
				type: 'task.commented' | 'task.comment_updated' | 'task.comment_deleted';
				data: { key: string; title: string; commentId: string; body: string };
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
				/** key is the task key for a task spec, the epic key for an epic spec, else the project key. */
				data: { key?: string; title: string };
		  }
		| {
				type:
					| 'question.added'
					| 'question.updated'
					| 'question.answered'
					| 'question.ignored'
					| 'question.reopened'
					| 'question.replied'
					| 'question.deleted';
				/**
				 * key is the epic key; title is the first question; count is how many were added.
				 * question and answer are the full texts, questionId and questionIds name the rows.
				 */
				data: {
					key: string;
					title: string;
					count?: number;
					questionId?: string;
					questionIds?: string[];
					question?: string;
					answer?: string;
					body?: string;
				};
		  }
		| {
				type: 'attachment.added' | 'attachment.deleted';
				/** key is the task key, or the epic key for an epic spec; title is the task or spec title. */
				data: {
					attachmentId: string;
					filename: string;
					size: number;
					mime: string;
					target: { type: 'project' | 'task' | 'spec'; id: string };
					key?: string;
					title?: string;
				};
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
