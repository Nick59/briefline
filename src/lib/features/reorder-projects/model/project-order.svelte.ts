import type { ProjectSummary } from '#lib/shared/domain/types.ts';
import { Sortable, type DropEvent } from '#lib/shared/lib/dnd/index.ts';
import { runOperation } from '#lib/shared/lib/run-operation.ts';
import { applyMove, planMove } from './reorder.ts';

export const PROJECT_ZONE = 'projects';

/** Drag-and-drop ordering of the project list, applied at once and saved with move_project. */
export function useProjectOrder(projects: () => ProjectSummary[]) {
	let pending = $state<{ id: string; beforeId: string | null } | null>(null);

	const ordered = $derived(
		pending ? applyMove(projects(), pending.id, pending.beforeId) : projects()
	);

	async function drop({ id, beforeId }: DropEvent) {
		if (planMove(projects(), id, beforeId) === undefined) return;
		pending = { id, beforeId };
		await runOperation('move_project', { project: id, beforeProject: beforeId });
		pending = null;
	}

	const sortable = new Sortable({ ondrop: drop });

	return {
		sortable,
		get projects() {
			return ordered;
		}
	};
}
