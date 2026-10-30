import type { Stage, WorkStatus } from '#lib/shared/domain/constants.ts';
import type { Task } from '#lib/shared/domain/types.ts';

export interface DropPlan {
	/** Set when the card lands in another column; its position is left alone. */
	status: WorkStatus | null;
	/** Present only for a same-column reorder: the task to insert before, or null for last. */
	beforeTask: string | null | undefined;
}

export const byPosition = (tasks: Task[]) => tasks.toSorted((a, b) => a.position - b.position);

/**
 * `tasks` is the whole epic in position order. A drop into another column only changes the
 * status; a drop inside the same column reorders in the epic order, using the card that
 * follows the column's last card when dropped at the end. Returns null when nothing changes.
 */
export function planDrop(
	tasks: Task[],
	movingId: string,
	stage: Stage,
	status: WorkStatus,
	beforeId: string | null
): DropPlan | null {
	const moving = tasks.find((t) => t.id === movingId);
	if (!moving) return null;
	if (moving.stages[stage] !== status) return { status, beforeTask: undefined };

	const rest = tasks.filter((t) => t.id !== movingId);
	const column = rest.filter((t) => t.stages[stage] === status);
	if (beforeId === movingId) return null;
	if (beforeId !== null && !column.some((t) => t.id === beforeId)) return null;

	const currentNext = column.find((t) => t.position > moving.position)?.id ?? null;
	if (beforeId === currentNext) return null;

	if (beforeId !== null) return { status: null, beforeTask: beforeId };
	const last = rest.findLastIndex((t) => t.stages[stage] === status);
	return { status: null, beforeTask: rest[last + 1]?.id ?? null };
}

/** Mirrors the server so the board updates before the request finishes. */
export function applyDrop(tasks: Task[], movingId: string, stage: Stage, plan: DropPlan): Task[] {
	const sorted = byPosition(tasks);
	const moving = sorted.find((t) => t.id === movingId);
	if (!moving) return sorted;
	if (plan.beforeTask === undefined) {
		return sorted.map((t) =>
			t.id === movingId && plan.status ? { ...t, stages: { ...t.stages, [stage]: plan.status } } : t
		);
	}
	const rest = sorted.filter((t) => t.id !== movingId);
	const index = plan.beforeTask ? rest.findIndex((t) => t.id === plan.beforeTask) : -1;
	rest.splice(index === -1 ? rest.length : index, 0, moving);
	return rest;
}
