import {
	mappingKeyForTask,
	mappingKeyFromState,
	stagesFor
} from '#lib/shared/domain/status-mapping.ts';
import type { PullStatus } from '#lib/shared/domain/pull-status.ts';
import type { Epic, ExternalRef, Project, SyncJob, Task } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { ConflictError, NotFoundError } from '../../core/errors.ts';
import { newId, now } from '../../core/ids.ts';
import type { CommentService } from '../comments/service.ts';
import type { EpicService } from '../epics/service.ts';
import type { TaskService } from '../tasks/service.ts';
import type { ResolvedConnection, TicketingConnectionService } from './connections.ts';
import type { RemoteTicket } from './provider.ts';

const ACTOR = 'ticket-sync';
const TICK_MS = 60_000;
const OWN_FOOTERS = ['from Briefline._', 'from the AI project dashboard._'];
const DESCRIPTION_HEADER = '**Briefline task description';

type PullListener = (projectId: string, status: PullStatus) => void;

const idle = (): PullStatus => ({ running: false, lastPulledAt: null, updated: 0, error: null });

interface Services {
	tasks: TaskService;
	epics: EpicService;
	comments: CommentService;
}

/** Reads linked tickets and writes their changes into Briefline; the ticket always wins. */
export class TicketPullService {
	#running = new Set<string>();
	#lastRun = new Map<string, number>();
	/** Last error per ticket, so an outage raises one event instead of one per pull. */
	#lastError = new Map<string, string>();
	#timer: ReturnType<typeof setInterval> | undefined;
	#status = new Map<string, PullStatus>();
	#listeners = new Set<PullListener>();
	#inFlight = new Set<Promise<void>>();

	constructor(
		private readonly deps: ServiceDeps,
		private readonly connections: TicketingConnectionService,
		private readonly services: Services,
		private readonly clock: () => number
	) {}

	start() {
		this.stop();
		this.#timer = setInterval(() => void this.tick(), TICK_MS);
		this.#timer.unref?.();
	}

	stop() {
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = undefined;
	}

	async tick() {
		const due = this.deps.repos.projects.list().filter((project) => {
			const { autoPull, pullMinutes, connectionId } = project.ticketing;
			if (!autoPull || !connectionId) return false;
			const last = this.#lastRun.get(project.id);
			return last === undefined || this.clock() - last >= pullMinutes * 60_000;
		});
		for (const project of due) this.#lastRun.set(project.id, this.clock());
		await Promise.allSettled(due.map((project) => this.pullProject(project.id)));
	}

	status(projectId: string): PullStatus {
		const project = this.deps.repos.projects.find(projectId);
		return { ...((project && this.#status.get(project.id)) ?? idle()) };
	}

	/** Whether the project has a connection whose provider can pull tickets. */
	canPull(projectId: string): boolean {
		const project = this.deps.repos.projects.find(projectId);
		return Boolean(project && this.connections.forProject(project)?.provider.fetchTicket);
	}

	/** Receives every start and end of a pull. Status changes are not domain events, so they never reach the activity log. */
	subscribe(listener: PullListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** Resolves when every pull that is running now has ended. */
	async idle() {
		await Promise.allSettled([...this.#inFlight]);
	}

	async pullProject(projectId: string) {
		const project = this.deps.repos.projects.find(projectId);
		if (project?.ticketing.autoPull) await this.#pull(project);
	}

	/** Starts a pull at once, even when autoPull is off or the interval has not passed, and returns without waiting for it. */
	pullNow(projectId: string): PullStatus {
		const project = this.deps.repos.projects.find(projectId);
		if (!project) throw new NotFoundError('Project', projectId);
		if (!this.canPull(project.id))
			throw new ConflictError('This project has no ticketing connection that supports pulling.');
		if (!this.#running.has(project.id)) {
			const run = this.#pull(project).finally(() => this.#inFlight.delete(run));
			this.#inFlight.add(run);
		}
		return this.status(project.id);
	}

	async #pull(project: Project) {
		if (this.#running.has(project.id)) return;
		this.#running.add(project.id);
		const previous = this.status(project.id);
		this.#publish(project.id, { ...previous, running: true });
		const failures: string[] = [];
		let updated = 0;
		let error: string | null = null;
		let pulled = false;
		try {
			const resolved = this.connections.forProject(project);
			if (resolved?.provider.fetchTicket) {
				pulled = true;
				for (const epic of this.deps.repos.epics.listByProject(project.id)) {
					const epicRef = epic.externalRef;
					if (hasOwnRef(epicRef, resolved))
						updated += await this.#guarded(project, epic, null, epicRef, failures, () =>
							this.#pullEpic(resolved, epicRef, epic)
						);
					for (const task of this.deps.repos.tasks.listByEpic(epic.id)) {
						const taskRef = task.externalRef;
						if (hasOwnRef(taskRef, resolved))
							updated += await this.#guarded(project, epic, task, taskRef, failures, () =>
								this.#pullTask(project, resolved, taskRef, task)
							);
					}
				}
			}
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			this.#running.delete(project.id);
			if (failures.length)
				error ??= `${failures.length} ${failures.length === 1 ? 'ticket' : 'tickets'} failed: ${failures[0]}`;
			this.#publish(
				project.id,
				pulled || error
					? { running: false, lastPulledAt: new Date(this.clock()).toISOString(), updated, error }
					: { ...previous, running: false }
			);
		}
	}

	#publish(projectId: string, status: PullStatus) {
		this.#status.set(projectId, status);
		for (const listener of this.#listeners) listener(projectId, { ...status });
	}

	async #guarded(
		project: Project,
		epic: Epic,
		task: Task | null,
		ref: ExternalRef,
		failures: string[],
		run: () => Promise<number>
	): Promise<number> {
		const id = `${project.id}:${ref.provider}:${ref.key}`;
		try {
			const changed = await run();
			this.#lastError.delete(id);
			return changed;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			failures.push(message);
			const timestamp = now();
			const job: SyncJob = {
				id: newId(),
				projectId: project.id,
				epicId: epic.id,
				taskId: task?.id ?? null,
				provider: ref.provider,
				operation: 'pull_ticket',
				payload: { ref },
				status: 'failed',
				attempts: 1,
				lastError: message,
				message: null,
				createdAt: timestamp,
				updatedAt: timestamp
			};
			this.deps.repos.syncJobs.insert(job);
			if (this.#lastError.get(id) === message) return 0;
			this.#lastError.set(id, message);
			this.deps.events.emit({
				type: 'ticket.sync_failed',
				projectId: project.id,
				epicId: epic.id,
				taskId: task?.id ?? null,
				actor: ACTOR,
				data: { provider: ref.provider, key: ref.key, error: message }
			});
			return 0;
		}
	}

	#fetch(resolved: ResolvedConnection, ref: ExternalRef): Promise<RemoteTicket> {
		return resolved.provider.fetchTicket!({ ...resolved.context, ref, mapped: null });
	}

	async #pullEpic(resolved: ResolvedConnection, ref: ExternalRef, epic: Epic): Promise<number> {
		const remote = await this.#fetch(resolved, ref);
		const input: { title?: string; summary?: string } = {};
		const title = remote.title.trim();
		if (title && title !== epic.title) input.title = title;
		const description = remote.description?.trim();
		if (description && description !== epic.summary) input.summary = description;
		if (!Object.keys(input).length) return 0;
		this.services.epics.update(epic.id, input, ACTOR);
		return 1;
	}

	async #pullTask(
		project: Project,
		resolved: ResolvedConnection,
		ref: ExternalRef,
		task: Task
	): Promise<number> {
		const remote = await this.#fetch(resolved, ref);
		const input: {
			title?: string;
			description?: string;
			stages?: Task['stages'];
		} = {};
		const title = remote.title.trim();
		if (title && title !== task.title) input.title = title;
		const description = remote.description?.trim();
		if (description && description !== task.description) input.description = description;
		if (remote.state && !task.cancelledAt) {
			const current = mappingKeyForTask(task.stages);
			const key = mappingKeyFromState(remote.state, project.ticketing.statusMapping, current);
			if (key && key !== current) input.stages = stagesFor(key);
		}
		let changed = 0;
		if (Object.keys(input).length) {
			this.services.tasks.update(task.id, input, ACTOR);
			changed = 1;
		}
		return changed + this.#importComments(resolved, ref, task, remote);
	}

	#importComments(
		resolved: ResolvedConnection,
		ref: ExternalRef,
		task: Task,
		remote: RemoteTicket
	): number {
		let imported = 0;
		const connectionId = resolved.connection.id;
		const known = this.deps.db.prepare(
			'SELECT 1 FROM ticket_comments WHERE connection_id = ? AND ticket_key = ? AND remote_id = ?'
		);
		const sorted = [...remote.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		for (const comment of sorted) {
			if (known.get(connectionId, ref.key, comment.id)) continue;
			if (OWN_FOOTERS.some((footer) => comment.body.includes(footer))) continue;
			if (comment.body.startsWith(DESCRIPTION_HEADER)) continue;
			const added = this.services.comments.add(
				task.id,
				{
					body: `${comment.body}\n\n_Comment by ${comment.author ?? 'unknown'} in ${resolved.provider.label}._`
				},
				ACTOR
			);
			this.deps.db
				.prepare(
					'INSERT INTO ticket_comments (comment_id, connection_id, ticket_key, remote_id) VALUES (?, ?, ?, ?)'
				)
				.run(added.id, connectionId, ref.key, comment.id);
			imported++;
		}
		return imported;
	}
}

function hasOwnRef(ref: ExternalRef | null, resolved: ResolvedConnection): ref is ExternalRef {
	return Boolean(ref?.key.trim()) && ref!.provider === resolved.provider.id;
}
