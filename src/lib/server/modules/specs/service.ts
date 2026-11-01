import {
	createSpecSchema,
	type BriefInput,
	updateSpecSchema,
	type CreateSpecInput,
	setSpecBriefSchema,
	type SetSpecBriefInput,
	type UpdateSpecInput
} from '#lib/shared/domain/schemas.ts';
import { profileGuidance } from '#lib/shared/domain/profile-guidance.ts';
import type { HumanBrief, Spec, SpecSummary } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { NotFoundError } from '../../core/errors.ts';
import { newId, now } from '../../core/ids.ts';
import { requireEpic, requireProject, requireTask } from '../../core/lookup.ts';
import type { BriefService } from '../briefs/service.ts';
import { toSpecSummary } from './repository.ts';

const agentBrief = (brief: BriefInput, actor = 'agent'): HumanBrief => ({
	...brief,
	source: actor === 'agent' ? 'agent' : `agent:${actor}`,
	generatedAt: now()
});

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

	listForProject(projectIdOrKey: string): SpecSummary[] {
		const project = requireProject(this.deps.repos, projectIdOrKey);
		return this.deps.repos.specs.listByProject(project.id).map(toSpecSummary);
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
	insert(epicId: string, taskId: string | null, input: CreateSpecInput, actor?: string): Spec {
		return this.#insert(
			{ epicId, projectId: null, taskId },
			this.deps.repos.specs.nextPosition({ epicId, taskId }),
			input,
			actor
		);
	}

	#insert(
		owner: Pick<Spec, 'epicId' | 'projectId' | 'taskId'>,
		position: number,
		input: CreateSpecInput,
		actor?: string
	): Spec {
		const data = createSpecSchema.parse(input);
		const timestamp = now();
		const spec: Spec = {
			id: newId(),
			...owner,
			title: data.title,
			kind: data.kind,
			content: data.content,
			brief: data.brief ? agentBrief(data.brief, actor) : null,
			position,
			viewedAt: null,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		this.deps.repos.specs.insert(spec);
		return spec;
	}

	createForEpic(epicIdOrKey: string, input: CreateSpecInput, actor: string): Spec {
		const epic = requireEpic(this.deps.repos, epicIdOrKey);
		const spec = this.insert(epic.id, null, input, actor);
		return this.#created(spec, actor);
	}

	createForProject(projectIdOrKey: string, input: CreateSpecInput, actor: string): Spec {
		const project = requireProject(this.deps.repos, projectIdOrKey);
		const spec = this.#insert(
			{ epicId: null, projectId: project.id, taskId: null },
			this.deps.repos.specs.nextPosition({ projectId: project.id }),
			input,
			actor
		);
		return this.#created(spec, actor);
	}

	#created(spec: Spec, actor: string): Spec {
		this.#emit('spec.created', spec, actor);
		if (spec.brief) this.#emit('spec.translated', spec, actor);
		return spec;
	}

	createForTask(taskIdOrKey: string, input: CreateSpecInput, actor: string): Spec {
		const task = requireTask(this.deps.repos, taskIdOrKey);
		const spec = this.insert(task.epicId, task.id, input, actor);
		return this.#created(spec, actor);
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
			brief: data.brief ? agentBrief(data.brief, actor) : contentChanged ? null : current.brief,
			viewedAt: contentChanged ? null : current.viewedAt,
			updatedAt: now()
		};
		this.deps.repos.specs.update(spec);
		this.#emit('spec.updated', spec, actor);
		if (data.brief) this.#emit('spec.translated', spec, actor);
		return spec;
	}

	setBrief(id: string, input: SetSpecBriefInput, actor: string): Spec {
		const { brief } = setSpecBriefSchema.parse(input);
		const spec: Spec = { ...this.get(id), brief: agentBrief(brief, actor), updatedAt: now() };
		this.deps.repos.specs.update(spec);
		this.#emit('spec.translated', spec, actor);
		return spec;
	}

	delete(id: string, actor: string) {
		const spec = this.get(id);
		this.deps.repos.specs.delete(id);
		this.#emit('spec.deleted', spec, actor);
	}

	async translate(id: string, actor: string, engine?: string): Promise<Spec> {
		const spec = this.get(id);
		const context = this.#context(spec);
		const profile = this.deps.repos.profile.get();
		const brief = await this.briefs.translate(
			{
				title: spec.title,
				content: spec.content,
				context,
				audience: profile ? profileGuidance(profile) : undefined
			},
			engine
		);

		const latest = this.get(id);
		const updated: Spec = { ...latest, brief, updatedAt: now() };
		this.deps.repos.specs.update(updated);
		this.#emit('spec.translated', updated, actor);
		return updated;
	}

	markViewed(id: string): Spec {
		const spec = this.get(id);
		if (spec.viewedAt) return spec;
		const viewedAt = now();
		this.deps.repos.specs.markViewed(id, viewedAt);
		return { ...spec, viewedAt };
	}

	#context(spec: Spec): string {
		const { repos } = this.deps;
		if (!spec.epicId) return `Project "${requireProject(repos, spec.projectId!).name}"`;
		const epic = requireEpic(repos, spec.epicId);
		const task = spec.taskId ? requireTask(repos, spec.taskId) : null;
		return task
			? `Task ${task.key} "${task.title}" in epic "${epic.title}"`
			: `Epic "${epic.title}"`;
	}

	#emit(
		type: 'spec.created' | 'spec.updated' | 'spec.deleted' | 'spec.translated',
		spec: Spec,
		actor: string
	) {
		const { repos } = this.deps;
		const epic = spec.epicId ? requireEpic(repos, spec.epicId) : null;
		const project = epic ? null : requireProject(repos, spec.projectId!);
		this.deps.events.emit({
			type,
			projectId: epic?.projectId ?? project!.id,
			epicId: epic?.id ?? null,
			taskId: spec.taskId,
			actor,
			data: {
				key: spec.taskId ? repos.tasks.find(spec.taskId)?.key : (epic?.key ?? project!.key),
				title: spec.title
			}
		});
	}
}
