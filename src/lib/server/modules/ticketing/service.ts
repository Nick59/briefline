import { STAGE_LABELS, STATUS_LABELS } from '#lib/shared/domain/constants.ts';
import {
	computeProgress,
	taskCurrentStage,
	taskOverallStatus
} from '#lib/shared/domain/progress.ts';
import {
	mappingKeyFor,
	mappingKeyForEpic,
	mappingKeyForTask
} from '#lib/shared/domain/status-mapping.ts';
import type { Epic, ExternalRef, Project, SyncJob, Task } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { InvalidInputError, NotFoundError } from '../../core/errors.ts';
import type { DomainEvent } from '../../core/events.ts';
import { newId, now } from '../../core/ids.ts';
import { requireEpic, requireProject } from '../../core/lookup.ts';
import type { TaskService } from '../tasks/service.ts';
import type { ResolvedConnection, TicketingConnectionService } from './connections.ts';
import { DescriptionHashes, hashDescription } from './description-hash.ts';
import type { TicketContext, TicketProviderInfo, TicketUpdate } from './provider.ts';
import type { TicketProviderRegistry } from './registry.ts';
import type { SyncJobFilter } from './repository.ts';

export const SYNC_TRIGGERS = new Set<DomainEvent['type']>([
	'task.commented',
	'task.comment_updated',
	'task.comment_deleted',
	'task.stage_changed',
	'task.cancelled',
	'task.restored',
	'task.created',
	'task.updated',
	'task.deleted',
	'epic.created',
	'epic.updated'
]);

export interface TicketSyncOptions {
	env: Record<string, string | undefined>;
	fetch: typeof fetch;
	publicUrl: string | null;
}

/**
 * Pushes dashboard changes to the external ticket of an epic (and of a task when it has one).
 * Every push is recorded as a sync job, so failures are visible and can be retried.
 */
export class TicketSyncService {
	#inflight = new Set<Promise<unknown>>();
	/** Last push per ticket. Pushes to one ticket run in order so an older status never lands last. */
	#queues = new Map<string, Promise<unknown>>();
	readonly #hashes: DescriptionHashes;

	constructor(
		private readonly deps: ServiceDeps,
		private readonly registry: TicketProviderRegistry,
		private readonly connections: TicketingConnectionService,
		private readonly tasks: TaskService,
		private readonly options: TicketSyncOptions
	) {
		this.#hashes = new DescriptionHashes(deps.db);
		deps.events.subscribe((event) => this.#onEvent(event));
	}

	providers(): TicketProviderInfo[] {
		return this.registry.list();
	}

	ticketUrl(project: Project, ref: ExternalRef): string | null {
		if (ref.url) return ref.url;
		const resolved = project.ticketing.provider === ref.provider ? this.#settingsOf(project) : {};
		return this.registry.get(ref.provider)?.ticketUrl(ref, resolved) ?? null;
	}

	#settingsOf(project: Project): Record<string, string> {
		const connectionId = project.ticketing.connectionId;
		const connection = connectionId ? this.deps.repos.connections.find(connectionId) : undefined;
		return { ...connection?.settings, ...project.ticketing.target };
	}

	jobs(filter: SyncJobFilter): SyncJob[] {
		return this.deps.repos.syncJobs.list(filter);
	}

	/** Pushes the current epic status now, even when automatic sync is off. */
	async syncEpic(epicIdOrKey: string, actor: string): Promise<SyncJob> {
		const epic = requireEpic(this.deps.repos, epicIdOrKey);
		if (!epic.externalRef) throw new InvalidInputError(`Epic ${epic.key} has no linked ticket`);
		const job = this.#enqueue(
			epic,
			null,
			epic.externalRef,
			this.#epicUpdate(epic, `Manual sync requested by ${actor}.`)
		);
		return this.#background(job);
	}

	async retry(jobId: string): Promise<SyncJob> {
		const job = this.deps.repos.syncJobs.find(jobId);
		if (!job) throw new NotFoundError('Sync job', jobId);
		if (job.operation === 'pull_ticket')
			throw new InvalidInputError('Pull failures retry on the next pull');
		return this.#background(job);
	}

	/** Resolves once every background push has finished. */
	async idle() {
		while (this.#inflight.size) await Promise.allSettled([...this.#inflight]);
	}

	#onEvent(event: DomainEvent) {
		if (!SYNC_TRIGGERS.has(event.type) || !event.epicId || event.actor === 'ticket-sync') return;
		const project = this.deps.repos.projects.find(event.projectId);
		if (!project?.ticketing.connectionId || !project.ticketing.autoSync) return;
		const epic = this.deps.repos.epics.find(event.epicId);
		if (!epic) return;
		if (event.type === 'epic.created') {
			for (const task of this.deps.repos.tasks.listByEpic(epic.id)) {
				if (task.externalRef)
					this.#enqueueDescription(
						{
							...event,
							type: 'task.created',
							taskId: task.id,
							data: { key: task.key, title: task.title }
						},
						project,
						epic
					);
			}
		}
		if (event.type === 'epic.updated' && !event.data.fields?.includes('externalRef')) return;

		const descriptionSync =
			event.type === 'task.created' ||
			(event.type === 'task.updated' &&
				(event.data.fields?.includes('description') || event.data.fields?.includes('externalRef')));
		if (event.type === 'task.updated' && !descriptionSync) return;

		if (descriptionSync) {
			this.#enqueueDescription(event, project, epic);
			if (event.type !== 'task.created') return;
		}
		if (
			event.type === 'task.commented' ||
			event.type === 'task.comment_updated' ||
			event.type === 'task.comment_deleted'
		) {
			this.#enqueueComment(event, project, epic);
			return;
		}

		const comment = this.#comment(event);
		if (epic.externalRef?.provider === project.ticketing.provider) {
			this.#background(
				this.#enqueue(epic, null, epic.externalRef, this.#epicUpdate(epic, comment))
			);
		}
		if (
			(event.type === 'task.stage_changed' ||
				event.type === 'task.cancelled' ||
				event.type === 'task.restored') &&
			event.taskId
		) {
			const task = this.deps.repos.tasks.find(event.taskId);
			if (task?.externalRef?.provider === project.ticketing.provider) {
				this.#background(
					this.#enqueue(
						epic,
						task,
						task.externalRef,
						this.#taskUpdate(project, epic, task, comment)
					)
				);
			}
		}
	}

	#enqueueComment(event: DomainEvent, project: Project, epic: Epic) {
		if (!event.taskId) return;
		const task = this.deps.repos.tasks.find(event.taskId);
		if (!task?.externalRef || task.externalRef.provider !== project.ticketing.provider) return;
		this.#enqueueSync(project, epic, task, 'sync_comment', {
			commentId: 'commentId' in event.data ? event.data.commentId : ''
		});
	}

	#enqueueDescription(event: DomainEvent, project: Project, epic: Epic) {
		if (!event.taskId) return;
		const task = this.deps.repos.tasks.find(event.taskId);
		if (!task?.externalRef || task.externalRef.provider !== project.ticketing.provider) return;
		if (
			!task.description.trim() &&
			(event.type === 'task.created' ||
				(event.type === 'task.updated' && !event.data.fields?.includes('description')))
		)
			return;
		// Linking adopts the ticket's description when it has one; a later edit pushes.
		const linking =
			event.type === 'task.created' ||
			(event.type === 'task.updated' && !event.data.fields?.includes('description'));
		this.#enqueueSync(project, epic, task, linking ? 'pull_description' : 'push_description', {});
	}

	#enqueueSync(
		project: Project,
		epic: Epic,
		task: Task,
		operation: 'sync_comment' | 'push_description' | 'pull_description',
		payload: Record<string, unknown>
	) {
		const timestamp = now();
		const job: SyncJob = {
			id: newId(),
			projectId: project.id,
			epicId: epic.id,
			taskId: task.id,
			provider: task.externalRef!.provider,
			operation,
			payload: {
				ref: task.externalRef,
				...payload,
				connectionId: project.ticketing.connectionId
			},
			status: 'pending',
			attempts: 0,
			lastError: null,
			message: null,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		this.deps.repos.syncJobs.insert(job);
		this.#background(job);
	}

	#comment(event: DomainEvent): string | null {
		const footer = `_Updated by ${event.actor} from the AI project dashboard._`;
		if (event.type === 'task.cancelled') {
			const { key, title, reason } = event.data;
			return [`**${key}** ${title}: cancelled`, reason, footer].filter(Boolean).join('\n\n');
		}
		if (event.type === 'task.restored') {
			const { key, title } = event.data;
			return [`**${key}** ${title}: restored`, footer].join('\n\n');
		}
		if (event.type !== 'task.stage_changed') return null;
		const { key, title, stage, to, note } = event.data;
		const line = `**${key}** ${title}: ${STAGE_LABELS[stage]} → ${STATUS_LABELS[to]}`;
		return [line, note, footer].filter(Boolean).join('\n\n');
	}

	#epicUpdate(epic: Epic, comment: string | null): TicketUpdate {
		const progress = computeProgress(this.deps.repos.tasks.listByEpic(epic.id));
		const summary = `Progress ${progress.percent}%${progress.currentStage ? ` · current stage: ${STAGE_LABELS[progress.currentStage]}` : ''}`;
		return {
			status: progress.status,
			stage: progress.currentStage,
			mappingKey: mappingKeyForEpic(progress),
			progress: progress.percent,
			title: epic.title,
			comment: comment && `${comment}\n\n${summary}`,
			dashboardUrl: this.#dashboardUrl(epic)
		};
	}

	#taskUpdate(project: Project, epic: Epic, task: Task, comment: string | null): TicketUpdate {
		const done = Object.values(task.stages).filter((s) => s === 'done').length;
		return {
			status: taskOverallStatus(task.stages),
			stage: taskCurrentStage(task.stages),
			mappingKey: mappingKeyForTask(task.stages),
			progress: Math.round((done / 3) * 100),
			title: task.title,
			comment,
			dashboardUrl: this.#dashboardUrl(epic, task) ?? (project.key && null)
		};
	}

	#dashboardUrl(epic: Epic, task?: Task): string | null {
		if (!this.options.publicUrl) return null;
		const project = requireProject(this.deps.repos, epic.projectId);
		const base = `${this.options.publicUrl.replace(/\/+$/, '')}/projects/${project.key}/epics/${epic.key}`;
		return task ? `${base}/tasks/${task.key}` : base;
	}

	#enqueue(epic: Epic, task: Task | null, ref: ExternalRef, update: TicketUpdate): SyncJob {
		const timestamp = now();
		const job: SyncJob = {
			id: newId(),
			projectId: epic.projectId,
			epicId: epic.id,
			taskId: task?.id ?? null,
			provider: ref.provider,
			operation: 'push_update',
			payload: { ref, update },
			status: 'pending',
			attempts: 0,
			lastError: null,
			message: null,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		this.deps.repos.syncJobs.insert(job);
		return job;
	}

	#background(job: SyncJob) {
		const { ref } = job.payload as { ref: ExternalRef };
		const queueKey = `${job.projectId}:${ref.provider}:${ref.key}`;
		const previous = this.#queues.get(queueKey) ?? Promise.resolve();
		const promise = previous.catch(() => undefined).then(() => this.#process(job));
		this.#queues.set(queueKey, promise);
		this.#inflight.add(promise);
		const cleanup = () => {
			this.#inflight.delete(promise);
			if (this.#queues.get(queueKey) === promise) this.#queues.delete(queueKey);
		};
		void promise.then(cleanup, cleanup);
		return promise;
	}

	#connectionChanged(job: SyncJob, project: Project, result: SyncJob) {
		const { connectionId } = job.payload as { connectionId: string };
		if (connectionId === project.ticketing.connectionId && project.ticketing.autoSync) return false;
		result.status = 'skipped';
		result.lastError = 'Sync is disabled or the connection changed';
		return true;
	}

	async #pushDescription(
		job: SyncJob,
		project: Project,
		resolved: ResolvedConnection,
		ref: ExternalRef,
		result: SyncJob
	) {
		if (this.#connectionChanged(job, project, result)) return;
		const task = job.taskId ? this.deps.repos.tasks.find(job.taskId) : undefined;
		if (!task || task.externalRef?.provider !== ref.provider || task.externalRef.key !== ref.key) {
			result.status = 'skipped';
			result.lastError = 'Task no longer exists or its linked ticket changed';
			return;
		}
		await this.#writeDescription(resolved, ref, task, result);
	}

	async #writeDescription(
		resolved: ResolvedConnection,
		ref: ExternalRef,
		task: Task,
		result: SyncJob
	) {
		const { provider, context } = resolved;
		if (!provider.pushDescription) {
			result.status = 'skipped';
			result.lastError = 'Provider does not sync descriptions';
			return;
		}
		const ticket = { ...context, ref, mapped: null };
		// Read the current description at execution time so a retry never restores an older text.
		const outcome = await provider.pushDescription(ticket, task.description.trim());
		await this.#rememberRemoteDescription(resolved, ticket, task.id);
		result.status = 'succeeded';
		result.lastError = null;
		result.message = outcome?.note ?? null;
	}

	/** On linking, the ticket's description wins when it has one; otherwise the Briefline one is pushed. */
	async #pullDescription(
		job: SyncJob,
		project: Project,
		resolved: ResolvedConnection,
		ref: ExternalRef,
		result: SyncJob
	) {
		if (this.#connectionChanged(job, project, result)) return;
		const task = job.taskId ? this.deps.repos.tasks.find(job.taskId) : undefined;
		if (!task || task.externalRef?.provider !== ref.provider || task.externalRef.key !== ref.key) {
			result.status = 'skipped';
			result.lastError = 'Task no longer exists or its linked ticket changed';
			return;
		}
		const { provider, context } = resolved;
		if (!provider.fetchTicket) {
			result.status = 'skipped';
			result.lastError = 'Provider cannot read tickets';
			return;
		}
		const remote = await provider.fetchTicket({ ...context, ref, mapped: null });
		const text = remote.description?.trim();
		if (!text) {
			if (task.description.trim()) await this.#writeDescription(resolved, ref, task, result);
			else {
				result.status = 'succeeded';
				result.lastError = null;
			}
			return;
		}
		this.#hashes.set(task.id, resolved.connection.id, ref.key, hashDescription(text));
		if (text !== task.description) this.tasks.update(task.id, { description: text }, 'ticket-sync');
		result.status = 'succeeded';
		result.lastError = null;
		result.message = 'Description imported from the ticket';
	}

	/** Records what the ticket returns for the description just written, which is not the markdown itself. */
	async #rememberRemoteDescription(
		resolved: ResolvedConnection,
		ticket: TicketContext,
		taskId: string
	) {
		const { provider } = resolved;
		if (!provider.fetchTicket) return;
		const connectionId = resolved.connection.id;
		try {
			const remote = await provider.fetchTicket(ticket);
			this.#hashes.set(taskId, connectionId, ticket.ref.key, hashDescription(remote.description));
		} catch {
			// Without a recorded hash the next pull stores the remote text instead of importing it.
			this.#hashes.clear(taskId, connectionId, ticket.ref.key);
		}
	}

	async #syncComment(
		job: SyncJob,
		project: Project,
		resolved: ResolvedConnection,
		ref: ExternalRef,
		result: SyncJob
	) {
		if (this.#connectionChanged(job, project, result)) return;
		const { commentId, connectionId } = job.payload as { commentId: string; connectionId: string };
		const { provider, context } = resolved;
		if (!provider.syncComment)
			throw new InvalidInputError('Provider does not support comment sync');
		const mapping = this.deps.db
			.prepare(
				'SELECT remote_id FROM ticket_comments WHERE comment_id = ? AND connection_id = ? AND ticket_key = ?'
			)
			.get(commentId, connectionId, ref.key) as { remote_id: string } | undefined;
		// Read the current comment at execution time: queued edits and retries must never
		// recreate deleted comments or replace a newer body with an old event snapshot.
		const comment = this.deps.repos.comments.find(commentId);
		if (comment || mapping) {
			const remoteId = await provider.syncComment(
				{ ...context, ref, mapped: null },
				{
					id: commentId,
					remoteId: mapping?.remote_id ?? null,
					body: comment ? `${comment.body}\n\n_Comment by ${comment.author} from Briefline._` : null
				}
			);
			if (comment && !remoteId) throw new InvalidInputError('Provider did not return a comment ID');
			if (remoteId) {
				this.deps.db
					.prepare(
						'INSERT OR REPLACE INTO ticket_comments (comment_id, connection_id, ticket_key, remote_id) VALUES (?, ?, ?, ?)'
					)
					.run(commentId, connectionId, ref.key, remoteId);
			} else {
				this.deps.db
					.prepare(
						'DELETE FROM ticket_comments WHERE comment_id = ? AND connection_id = ? AND ticket_key = ?'
					)
					.run(commentId, connectionId, ref.key);
			}
		}
		result.status = 'succeeded';
		result.lastError = null;
	}

	async #process(job: SyncJob): Promise<SyncJob> {
		const { repos, events } = this.deps;
		job = repos.syncJobs.find(job.id) ?? job;
		if (job.status === 'succeeded') return job;
		const { ref, update } = job.payload as { ref: ExternalRef; update: TicketUpdate };
		const provider = this.registry.get(job.provider);
		const project = repos.projects.find(job.projectId);
		const result: SyncJob = { ...job, attempts: job.attempts + 1, message: null, updatedAt: now() };

		if (!provider || !project) {
			result.status = 'skipped';
			result.lastError = provider
				? 'Project no longer exists'
				: `Unknown ticket provider '${job.provider}'`;
		} else {
			try {
				const resolved = this.connections.forProject(project);
				if (!resolved || resolved.provider.id !== provider.id) {
					result.status = 'skipped';
					result.lastError = 'Project has no ticketing connection for this provider';
				} else {
					// Jobs queued before descriptions had their own operation carry this flag.
					const legacyDescription = (job.payload as { description?: boolean }).description;
					if (job.operation === 'sync_comment' && !legacyDescription) {
						await this.#syncComment(job, project, resolved, ref, result);
					} else if (job.operation === 'pull_description') {
						await this.#pullDescription(job, project, resolved, ref, result);
					} else if (job.operation === 'push_description' || legacyDescription) {
						await this.#pushDescription(job, project, resolved, ref, result);
					} else {
						const key = update.mappingKey ?? mappingKeyFor(update.status, update.stage);
						const outcome = await provider.push(
							{
								...resolved.context,
								ref,
								mapped: project.ticketing.statusMapping[key] ?? null
							},
							update
						);
						result.status = 'succeeded';
						result.lastError = null;
						result.message = outcome?.note ?? null;
					}
				}
			} catch (error) {
				result.status = 'failed';
				result.lastError = error instanceof Error ? error.message : String(error);
			}
		}
		repos.syncJobs.update(result);

		if (project && result.status !== 'skipped') {
			events.emit({
				type: result.status === 'succeeded' ? 'ticket.synced' : 'ticket.sync_failed',
				projectId: project.id,
				epicId: job.epicId,
				taskId: job.taskId,
				actor: 'ticket-sync',
				data: { provider: job.provider, key: ref.key, error: result.lastError ?? undefined }
			});
		}
		return result;
	}
}
