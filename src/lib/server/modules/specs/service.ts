import {
	createSpecSchema,
	updateSpecSchema,
	type CreateSpecInput,
	type UpdateSpecInput
} from '#lib/shared/domain/schemas.ts';
import type { Epic, Spec, SpecSummary } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { NotFoundError } from '../../core/errors.ts';
import { newId, now } from '../../core/ids.ts';
import { requireEpic, requireTask } from '../../core/lookup.ts';
import type { BriefService } from '../briefs/service.ts';
import { toSpecSummary } from './repository.ts';

export class SpecService {
	constructor(
		private readonly deps: ServiceDeps,
		private readonly briefs: BriefService
	) {}

	listForEpic(epicIdOrKey: string, includeTaskSpecs = false): SpecSummary[] {
		const epic = requireEpic(this.deps.repos, epicIdOrKey);
		return this.deps.repos.specs
			.listByEpic(epic.id, includeTaskSpecs ? undefined : null)
			.map(toSpecSummary);
	}

	listForTask(taskIdOrKey: string): SpecSummary[] {
		const task = requireTask(this.deps.repos, taskIdOrKey);
		return this.deps.repos.specs.listByEpic(task.epicId, task.id).map(toSpecSummary);
	}

	get(id: string): Spec {
		const spec = this.deps.repos.specs.find(id);
		if (!spec) throw new NotFoundError('Spec', id);
		return spec;
	}

	/** Inserts without emitting an event; callers emit their own. */
	insert(epicId: string, taskId: string | null, input: CreateSpecInput): Spec {
		const data = createSpecSchema.parse(input);
		const timestamp = now();
		const spec: Spec = {
			id: newId(),
			epicId,
			taskId,
			title: data.title,
			kind: data.kind,
			content: data.content,
			brief: null,
			position: this.deps.repos.specs.nextPosition(epicId, taskId),
			createdAt: timestamp,
			updatedAt: timestamp
		};
		this.deps.repos.specs.insert(spec);
		return spec;
	}

	createForEpic(epicIdOrKey: string, input: CreateSpecInput, actor: string): Spec {
		const epic = requireEpic(this.deps.repos, epicIdOrKey);
		const spec = this.insert(epic.id, null, input);
		this.#emit('spec.created', epic, spec, actor);
		return spec;
	}

	createForTask(taskIdOrKey: string, input: CreateSpecInput, actor: string): Spec {
		const task = requireTask(this.deps.repos, taskIdOrKey);
		const epic = requireEpic(this.deps.repos, task.epicId);
		const spec = this.insert(epic.id, task.id, input);
		this.#emit('spec.created', epic, spec, actor);
		return spec;
	}

	update(id: string, input: UpdateSpecInput, actor: string): Spec {
		const data = updateSpecSchema.parse(input);
		const current = this.get(id);
		const contentChanged = data.content !== undefined && data.content !== current.content;
		const spec: Spec = {
			...current,
			title: data.title ?? current.title,
			kind: data.kind ?? current.kind,
			content: data.content ?? current.content,
			position: data.position ?? current.position,
			// A brief describes one version of the content; it is stale once the content changes.
			brief: contentChanged ? null : current.brief,
			updatedAt: now()
		};
		this.deps.repos.specs.update(spec);
		this.#emit('spec.updated', requireEpic(this.deps.repos, spec.epicId), spec, actor);
		return spec;
	}

	delete(id: string, actor: string) {
		const spec = this.get(id);
		this.deps.repos.specs.delete(id);
		this.#emit('spec.deleted', requireEpic(this.deps.repos, spec.epicId), spec, actor);
	}

	async translate(id: string, actor: string, engine?: string): Promise<Spec> {
		const spec = this.get(id);
		const epic = requireEpic(this.deps.repos, spec.epicId);
		const task = spec.taskId ? requireTask(this.deps.repos, spec.taskId) : null;
		const context = task
			? `Task ${task.key} "${task.title}" in epic "${epic.title}"`
			: `Epic "${epic.title}"`;
		const brief = await this.briefs.translate(
			{ title: spec.title, content: spec.content, context },
			engine
		);

		const latest = this.get(id);
		const updated: Spec = { ...latest, brief, updatedAt: now() };
		this.deps.repos.specs.update(updated);
		this.#emit('spec.translated', epic, updated, actor);
		return updated;
	}

	#emit(
		type: 'spec.created' | 'spec.updated' | 'spec.deleted' | 'spec.translated',
		epic: Epic,
		spec: Spec,
		actor: string
	) {
		this.deps.events.emit({
			type,
			projectId: epic.projectId,
			epicId: epic.id,
			taskId: spec.taskId,
			actor,
			data: { title: spec.title }
		});
	}
}
