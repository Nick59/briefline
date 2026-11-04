import { STAGES, type WorkStatus } from '#lib/shared/domain/constants.ts';
import {
	cancelTaskSchema,
	createTaskSchema,
	moveTaskSchema,
	setStageStatusSchema,
	updateTaskSchema,
	type CancelTaskInput,
	type CreateTaskInput,
	type MoveTaskInput,
	type SetStageStatusInput,
	type UpdateTaskInput
} from '#lib/shared/domain/schemas.ts';
import type { Epic, Task, TaskDetail } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { InvalidInputError, OpenQuestionsError, SpecsNotApprovedError } from '../../core/errors.ts';
import { newId, now } from '../../core/ids.ts';
import { transaction } from '../../db/connection.ts';
import { requireEpic, requireProject, requireTask } from '../../core/lookup.ts';
import { toSpecSummary } from '../specs/repository.ts';
import type { TaskFilter } from './repository.ts';

export class TaskService {
	constructor(private readonly deps: ServiceDeps) {}

	list(epicIdOrKey: string, filter: TaskFilter = {}): Task[] {
		const epic = requireEpic(this.deps.repos, epicIdOrKey);
		return this.deps.repos.tasks.listByEpic(epic.id, filter);
	}

	get(idOrKey: string): Task {
		return requireTask(this.deps.repos, idOrKey);
	}

	detail(idOrKey: string): TaskDetail {
		const { repos } = this.deps;
		const task = this.get(idOrKey);
		const epic = requireEpic(repos, task.epicId);
		const project = requireProject(repos, epic.projectId);
		return {
			...task,
			epic: {
				id: epic.id,
				key: epic.key,
				title: epic.title,
				projectId: epic.projectId,
				externalRef: epic.externalRef,
				specsApprovedAt: epic.specsApprovedAt,
				specsApprovedBy: epic.specsApprovedBy
			},
			project: { id: project.id, key: project.key, name: project.name },
			specs: repos.specs.listByEpic(epic.id, task.id).map(toSpecSummary),
			comments: repos.comments.listByTask(task.id)
		};
	}

	/** Inserts without emitting an event; callers emit their own. */
	insert(epic: Epic, input: CreateTaskInput): Task {
		const data = createTaskSchema.parse(input);
		const { repos } = this.deps;
		const project = requireProject(repos, epic.projectId);
		const timestamp = now();
		const task: Task = {
			id: newId(),
			epicId: epic.id,
			key: `${project.key}-${repos.projects.nextSequence(project.id, 'task')}`,
			title: data.title,
			description: data.description,
			summary: data.summary,
			priority: data.priority,
			assignee: data.assignee ?? null,
			stages: { dev: 'todo', test: 'todo', deploy: 'todo', ...data.stages },
			externalRef: data.externalRef
				? { ...data.externalRef, url: data.externalRef.url ?? null }
				: null,
			position: repos.tasks.nextPosition(epic.id),
			commentCount: 0,
			cancelledAt: null,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		repos.tasks.insert(task);
		return task;
	}

	create(epicIdOrKey: string, input: CreateTaskInput, actor: string): Task {
		const epic = requireEpic(this.deps.repos, epicIdOrKey);
		const task = this.insert(epic, input);
		this.#emit('task.created', epic, task, actor);
		return task;
	}

	update(idOrKey: string, input: UpdateTaskInput, actor: string): Task {
		const data = updateTaskSchema.parse(input);
		const current = this.get(idOrKey);
		const epic = requireEpic(this.deps.repos, current.epicId);
		if (data.stages) this.#assertNotCancelled(current);
		for (const stage of STAGES) {
			const to = data.stages?.[stage];
			if (to) this.#assertCanChange(epic, current.stages[stage], to, actor);
		}
		const task: Task = {
			...current,
			title: data.title ?? current.title,
			description: data.description ?? current.description,
			summary: data.summary ?? current.summary,
			priority: data.priority ?? current.priority,
			assignee: data.assignee === undefined ? current.assignee : data.assignee,
			stages: { ...current.stages, ...data.stages },
			externalRef:
				data.externalRef === undefined
					? current.externalRef
					: data.externalRef && { ...data.externalRef, url: data.externalRef.url ?? null },
			position: data.position ?? current.position,
			updatedAt: now()
		};
		this.deps.repos.tasks.update(task);

		const changedStages = STAGES.filter((s) => current.stages[s] !== task.stages[s]);
		for (const stage of changedStages) {
			this.deps.events.emit({
				type: 'task.stage_changed',
				projectId: epic.projectId,
				epicId: epic.id,
				taskId: task.id,
				actor,
				data: {
					key: task.key,
					title: task.title,
					stage,
					from: current.stages[stage],
					to: task.stages[stage]
				}
			});
		}
		const fields = Object.keys(data).filter((f) => f !== 'stages');
		if (fields.length) this.#emit('task.updated', epic, task, actor, fields);
		return task;
	}

	setStage(idOrKey: string, input: SetStageStatusInput, actor: string): Task {
		const { stage, status, note } = setStageStatusSchema.parse(input);
		const current = this.get(idOrKey);
		this.#assertNotCancelled(current);
		if (current.stages[stage] === status) return current;
		const epic = requireEpic(this.deps.repos, current.epicId);
		this.#assertCanChange(epic, current.stages[stage], status, actor);
		const task: Task = {
			...current,
			stages: { ...current.stages, [stage]: status },
			updatedAt: now()
		};
		this.deps.repos.tasks.update(task);
		this.deps.events.emit({
			type: 'task.stage_changed',
			projectId: epic.projectId,
			epicId: epic.id,
			taskId: task.id,
			actor,
			data: {
				key: task.key,
				title: task.title,
				stage,
				from: current.stages[stage],
				to: status,
				note
			}
		});
		return task;
	}

	/**
	 * Moves a task on the board: optionally changes one stage status, and places it before
	 * another task of the same epic (or last). Reordering alone is cosmetic, so it is not logged.
	 */
	move(idOrKey: string, input: MoveTaskInput, actor: string): Task {
		const { stage, status, beforeTask, note, epic: destination } = moveTaskSchema.parse(input);
		if ((stage === undefined) !== (status === undefined)) {
			throw new InvalidInputError('Send stage and status together');
		}
		const { db, repos } = this.deps;
		const task = this.get(idOrKey);
		const source = requireEpic(repos, task.epicId);
		const target = destination ? requireEpic(repos, destination) : source;
		if (target.projectId !== source.projectId)
			throw new InvalidInputError('Tasks can only move within the same project');
		if (stage && status) this.#assertNotCancelled(task);
		const transferring = target.id !== source.id;
		const before = beforeTask ? this.get(beforeTask) : null;
		if (before && before.epicId !== target.id) {
			throw new InvalidInputError(`Task ${before.key} is not in the same epic`);
		}

		return transaction(db, () => {
			if (transferring) {
				repos.tasks.update({
					...task,
					epicId: target.id,
					position: repos.tasks.nextPosition(target.id),
					updatedAt: now()
				});
				db.prepare('UPDATE specs SET epic_id = ? WHERE task_id = ?').run(target.id, task.id);
			}
			if (stage && status) this.setStage(task.id, { stage, status, note }, actor);
			if ((beforeTask !== undefined || transferring) && before?.id !== task.id) {
				const order = repos.tasks.listByEpic(target.id).filter((t) => t.id !== task.id);
				const index = before ? order.findIndex((t) => t.id === before.id) : order.length;
				order.splice(index, 0, task);
				order.forEach((t, position) => {
					if (t.position !== position || t.id === task.id) repos.tasks.setPosition(t.id, position);
				});
			}
			if (transferring) {
				repos.tasks.listByEpic(source.id).forEach((t, position) => {
					if (t.position !== position) repos.tasks.setPosition(t.id, position);
				});
				this.#emit('task.updated', source, task, actor, ['epicId']);
				this.#emit('task.updated', target, this.get(task.id), actor, ['epicId']);
			}
			return this.get(task.id);
		});
	}

	/** Idempotent: a task that is already cancelled is returned as is. */
	cancel(idOrKey: string, input: CancelTaskInput, actor: string): Task {
		const { reason } = cancelTaskSchema.parse(input);
		const current = this.get(idOrKey);
		if (current.cancelledAt) return current;
		const epic = requireEpic(this.deps.repos, current.epicId);
		const timestamp = now();
		const task: Task = { ...current, cancelledAt: timestamp, updatedAt: timestamp };
		this.deps.repos.tasks.update(task);
		this.deps.events.emit({
			type: 'task.cancelled',
			projectId: epic.projectId,
			epicId: epic.id,
			taskId: task.id,
			actor,
			data: { key: task.key, title: task.title, reason }
		});
		return task;
	}

	/** Idempotent: a task that is not cancelled is returned as is. */
	restore(idOrKey: string, actor: string): Task {
		const current = this.get(idOrKey);
		if (!current.cancelledAt) return current;
		const epic = requireEpic(this.deps.repos, current.epicId);
		const task: Task = { ...current, cancelledAt: null, updatedAt: now() };
		this.deps.repos.tasks.update(task);
		this.deps.events.emit({
			type: 'task.restored',
			projectId: epic.projectId,
			epicId: epic.id,
			taskId: task.id,
			actor,
			data: { key: task.key, title: task.title }
		});
		return task;
	}

	delete(idOrKey: string, actor: string) {
		const task = this.get(idOrKey);
		const epic = requireEpic(this.deps.repos, task.epicId);
		this.deps.repos.tasks.delete(task.id);
		this.#emit('task.deleted', epic, task, actor);
	}

	#assertNotCancelled(task: Task) {
		if (task.cancelledAt) {
			throw new InvalidInputError(`Task ${task.key} is cancelled; restore it first`);
		}
	}

	/** Work that already started may continue; only starting a stage waits for questions and, when the epic has specs, their approval. */
	#assertCanChange(epic: Epic, from: WorkStatus, to: WorkStatus, actor: string) {
		// A pulled ticket state wins over the guard: the work already started in the ticket.
		if (actor === 'ticket-sync' || from !== 'todo' || to === 'todo') return;
		const open = this.deps.repos.questions.countOpen(epic.id);
		if (open > 0) throw new OpenQuestionsError(epic.key, open);
		if (!epic.specsApprovedAt && this.deps.repos.specs.countByEpic(epic.id) > 0)
			throw new SpecsNotApprovedError(epic.key);
	}

	#emit(
		type: 'task.created' | 'task.updated' | 'task.deleted',
		epic: Epic,
		task: Task,
		actor: string,
		fields?: string[]
	) {
		this.deps.events.emit({
			type,
			projectId: epic.projectId,
			epicId: epic.id,
			taskId: type === 'task.deleted' ? null : task.id,
			actor,
			data: { key: task.key, title: task.title, fields }
		});
	}
}
