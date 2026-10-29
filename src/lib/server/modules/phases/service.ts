import { computeProgress } from '#lib/shared/domain/progress.ts';
import {
	createPhaseSchema,
	updatePhaseSchema,
	type CreatePhaseInput,
	type UpdatePhaseInput
} from '#lib/shared/domain/schemas.ts';
import type { Phase, PhaseWithProgress, Task } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { InvalidInputError, NotFoundError } from '../../core/errors.ts';
import { newId, now } from '../../core/ids.ts';
import { requireEpic } from '../../core/lookup.ts';

export function withProgress(phase: Phase, tasks: Task[]): PhaseWithProgress {
	const own = tasks.filter((t) => t.phaseId === phase.id);
	const progress = computeProgress(own);
	return {
		...phase,
		progress,
		effectiveStatus: own.length ? progress.status : phase.status,
		taskIds: own.map((t) => t.id)
	};
}

export class PhaseService {
	constructor(private readonly deps: ServiceDeps) {}

	get(id: string): Phase {
		const phase = this.deps.repos.phases.find(id);
		if (!phase) throw new NotFoundError('Phase', id);
		return phase;
	}

	/** Inserts without emitting an event; callers emit their own. */
	insert(epicId: string, input: CreatePhaseInput): Phase {
		const data = createPhaseSchema.parse(input);
		checkDates(data.startDate, data.endDate);
		const timestamp = now();
		const phase: Phase = {
			id: newId(),
			epicId,
			name: data.name,
			description: data.description,
			position: data.position ?? this.deps.repos.phases.nextPosition(epicId),
			startDate: data.startDate ?? null,
			endDate: data.endDate ?? null,
			status: data.status ?? 'todo',
			createdAt: timestamp,
			updatedAt: timestamp
		};
		this.deps.repos.phases.insert(phase);
		return phase;
	}

	create(epicIdOrKey: string, input: CreatePhaseInput, actor: string): Phase {
		const epic = requireEpic(this.deps.repos, epicIdOrKey);
		const phase = this.insert(epic.id, input);
		this.#emit('phase.created', epic.projectId, phase, actor);
		return phase;
	}

	update(id: string, input: UpdatePhaseInput, actor: string): Phase {
		const data = updatePhaseSchema.parse(input);
		const current = this.get(id);
		const phase: Phase = {
			...current,
			...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
			updatedAt: now()
		};
		checkDates(phase.startDate, phase.endDate);
		this.deps.repos.phases.update(phase);
		const epic = requireEpic(this.deps.repos, phase.epicId);
		this.#emit('phase.updated', epic.projectId, phase, actor, Object.keys(data));
		return phase;
	}

	delete(id: string, actor: string) {
		const phase = this.get(id);
		const epic = requireEpic(this.deps.repos, phase.epicId);
		this.deps.repos.phases.delete(id);
		this.#emit('phase.deleted', epic.projectId, phase, actor);
	}

	#emit(
		type: 'phase.created' | 'phase.updated' | 'phase.deleted',
		projectId: string,
		phase: Phase,
		actor: string,
		fields?: string[]
	) {
		this.deps.events.emit({
			type,
			projectId,
			epicId: phase.epicId,
			taskId: null,
			actor,
			data: { name: phase.name, fields }
		});
	}
}

function checkDates(start?: string | null, end?: string | null) {
	if (start && end && start > end)
		throw new InvalidInputError('The phase end date must be on or after its start date');
}
