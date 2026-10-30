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
import type { TicketingConnectionService } from './connections.ts';
import type { TicketProviderInfo, TicketUpdate } from './provider.ts';
import type { TicketProviderRegistry } from './registry.ts';
import type { SyncJobFilter } from './repository.ts';

const SYNC_TRIGGERS = new Set<DomainEvent['type']>([
	'task.stage_changed',
	'task.created',
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

	constructor(
		private readonly deps: ServiceDeps,
		private readonly registry: TicketProviderRegistry,
		private readonly connections: TicketingConnectionService,
		private readonly options: TicketSyncOptions
	) {
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
		return this.#process(job);
	}

	async retry(jobId: string): Promise<SyncJob> {
		const job = this.deps.repos.syncJobs.find(jobId);
		if (!job) throw new NotFoundError('Sync job', jobId);
		return this.#process(job);
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
		if (event.type === 'epic.updated' && !event.data.fields?.includes('externalRef')) return;

		const comment = project.ticketing.postComments ? this.#comment(event) : null;
		if (epic.externalRef?.provider === project.ticketing.provider) {
			this.#background(
				this.#enqueue(epic, null, epic.externalRef, this.#epicUpdate(epic, comment))
			);
		}
		if (event.type === 'task.stage_changed' && event.taskId) {
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

	#comment(event: DomainEvent): string | null {
		if (event.type !== 'task.stage_changed') return null;
		const { key, title, stage, to, note } = event.data;
		const line = `**${key}** ${title}: ${STAGE_LABELS[stage]} → ${STATUS_LABELS[to]}`;
		return [line, note, `_Updated by ${event.actor} from the AI project dashboard._`]
			.filter(Boolean)
			.join('\n\n');
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
		const queueKey = `${ref.provider}:${ref.key}`;
		const previous = this.#queues.get(queueKey) ?? Promise.resolve();
		const promise = previous.then(() => this.#process(job));
		this.#queues.set(queueKey, promise);
		this.#inflight.add(promise);
		void promise.finally(() => {
			this.#inflight.delete(promise);
			if (this.#queues.get(queueKey) === promise) this.#queues.delete(queueKey);
		});
	}

	async #process(job: SyncJob): Promise<SyncJob> {
		const { repos, events } = this.deps;
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
