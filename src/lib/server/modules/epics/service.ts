import { computeProgress } from '#lib/shared/domain/progress.ts';
import {
	createEpicSchema,
	moveEpicSchema,
	updateEpicSchema,
	type CreateEpicInput,
	type MoveEpicInput,
	type UpdateEpicInput
} from '#lib/shared/domain/schemas.ts';
import type { Epic, EpicDetail, EpicSummary, ExternalRef } from '#lib/shared/domain/types.ts';
import { transaction } from '../../db/connection.ts';
import { InvalidInputError } from '../../core/errors.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { newId, now } from '../../core/ids.ts';
import { requireEpic, requireProject } from '../../core/lookup.ts';
import { toSpecSummary } from '../specs/repository.ts';
import type { SpecService } from '../specs/service.ts';
import type { TaskService } from '../tasks/service.ts';

const normalizeRef = (
	ref: { provider: string; key: string; url?: string | null } | null | undefined
): ExternalRef | null =>
	ref ? { provider: ref.provider, key: ref.key, url: ref.url ?? null } : null;

export class EpicService {
	constructor(
		private readonly deps: ServiceDeps,
		private readonly tasks: TaskService,
		private readonly specs: SpecService
	) {}

	list(projectIdOrKey: string): EpicSummary[] {
		const { repos } = this.deps;
		const project = requireProject(repos, projectIdOrKey);
		const questionCounts = repos.questions.countByProject(project.id);
		return repos.epics.listByProject(project.id).map((epic) => {
			const tasks = repos.tasks.listByEpic(epic.id);
			return {
				...epic,
				progress: computeProgress(tasks),
				taskCount: tasks.filter((task) => !task.cancelledAt).length,
				openQuestions: questionCounts.get(epic.id)?.open ?? 0,
				questionCount: questionCounts.get(epic.id)?.total ?? 0,
				specsRequired: repos.specs.countByEpic(epic.id) > 0
			};
		});
	}

	/** Epics an agent can work on now, in the user's order. */
	workToDo(projectIdOrKey: string): EpicSummary[] {
		return this.list(projectIdOrKey).filter(
			(epic) =>
				epic.openQuestions === 0 &&
				(!epic.specsRequired || epic.specsApprovedAt) &&
				epic.progress.status !== 'done'
		);
	}

	get(idOrKey: string): Epic {
		return requireEpic(this.deps.repos, idOrKey);
	}

	detail(idOrKey: string): EpicDetail {
		const { repos } = this.deps;
		const epic = this.get(idOrKey);
		const project = requireProject(repos, epic.projectId);
		const tasks = repos.tasks.listByEpic(epic.id);
		const questions = repos.questions.listByEpic(epic.id);
		return {
			...epic,
			project: { id: project.id, key: project.key, name: project.name },
			progress: computeProgress(tasks),
			tasks,
			specs: repos.specs.listByEpic(epic.id).map(toSpecSummary),
			questions,
			openQuestions: repos.questions.countOpen(epic.id),
			questionCount: questions.length,
			specsRequired: repos.specs.countByEpic(epic.id) > 0
		};
	}

	/** Creates the epic with its whole plan (tasks, specs) in one transaction. */
	create(projectIdOrKey: string, input: CreateEpicInput, actor: string): EpicDetail {
		const data = createEpicSchema.parse(input);
		const { db, repos, events } = this.deps;
		const project = requireProject(repos, projectIdOrKey);

		const epic = transaction(db, () => {
			const timestamp = now();
			const epic: Epic = {
				id: newId(),
				specsApprovedAt: null,
				specsApprovedBy: null,
				projectId: project.id,
				key: `${project.key}-E${repos.projects.nextSequence(project.id, 'epic')}`,
				title: data.title,
				summary: data.summary,
				externalRef: normalizeRef(data.externalRef),
				targetDate: data.targetDate ?? null,
				position: repos.epics.nextPosition(project.id),
				createdAt: timestamp,
				updatedAt: timestamp
			};
			repos.epics.insert(epic);

			for (const { specs = [], ...taskInput } of data.tasks ?? []) {
				const task = this.tasks.insert(epic, taskInput);
				for (const spec of specs) this.specs.insert(epic.id, task.id, spec, actor);
			}
			for (const spec of data.specs ?? []) this.specs.insert(epic.id, null, spec, actor);
			return epic;
		});

		events.emit({
			type: 'epic.created',
			projectId: project.id,
			epicId: epic.id,
			taskId: null,
			actor,
			data: { key: epic.key, title: epic.title }
		});
		return this.detail(epic.id);
	}

	update(idOrKey: string, input: UpdateEpicInput, actor: string): Epic {
		const data = updateEpicSchema.parse(input);
		const current = this.get(idOrKey);
		const epic: Epic = {
			...current,
			title: data.title ?? current.title,
			summary: data.summary ?? current.summary,
			targetDate: data.targetDate === undefined ? current.targetDate : data.targetDate,
			externalRef:
				data.externalRef === undefined ? current.externalRef : normalizeRef(data.externalRef),
			updatedAt: now()
		};
		this.deps.repos.epics.update(epic);
		this.deps.events.emit({
			type: 'epic.updated',
			projectId: epic.projectId,
			epicId: epic.id,
			taskId: null,
			actor,
			data: { key: epic.key, title: epic.title, fields: Object.keys(data) }
		});
		return epic;
	}

	approveSpecs(idOrKey: string, actor: string): Epic {
		const current = this.get(idOrKey);
		if (current.specsApprovedAt) return current;
		const epic = { ...current, specsApprovedAt: now(), specsApprovedBy: actor, updatedAt: now() };
		this.deps.repos.epics.update(epic);
		this.deps.events.emit({
			type: 'epic.updated',
			projectId: epic.projectId,
			epicId: epic.id,
			taskId: null,
			actor,
			data: { key: epic.key, title: epic.title, fields: ['specsApprovedAt', 'specsApprovedBy'] }
		});
		return epic;
	}

	/** Places an epic before another epic of its project, or last. Reordering is cosmetic, so it is not logged. */
	move(idOrKey: string, input: MoveEpicInput): Epic {
		const { beforeEpic } = moveEpicSchema.parse(input);
		const { db, repos } = this.deps;
		const epic = this.get(idOrKey);
		const before = beforeEpic ? this.get(beforeEpic) : null;
		if (before && before.projectId !== epic.projectId)
			throw new InvalidInputError('beforeEpic must belong to the same project');
		if (before?.id === epic.id) return epic;
		return transaction(db, () => {
			const order = repos.epics.listByProject(epic.projectId).filter((e) => e.id !== epic.id);
			const index = before ? order.findIndex((e) => e.id === before.id) : order.length;
			order.splice(index, 0, epic);
			order.forEach((e, position) => {
				if (e.position !== position) repos.epics.setPosition(e.id, position);
			});
			return this.get(epic.id);
		});
	}

	delete(idOrKey: string, actor: string) {
		const epic = this.get(idOrKey);
		this.deps.repos.epics.delete(epic.id);
		this.deps.events.emit({
			type: 'epic.deleted',
			projectId: epic.projectId,
			epicId: epic.id,
			taskId: null,
			actor,
			data: { key: epic.key, title: epic.title }
		});
	}
}
