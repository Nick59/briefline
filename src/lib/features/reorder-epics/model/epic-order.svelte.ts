import { runOperation } from '#lib/shared/lib/run-operation.ts';
import { applyMove, planMove } from '#lib/shared/lib/reorder.ts';

// Module-level so the sidebar and the project timeline show an in-flight move together.
let pending = $state<{ id: string; beforeId: string | null } | null>(null);

/** Epic order of one project, applied at once and saved with move_epic. */
export function useEpicOrder<T extends { id: string }>(epics: () => T[]) {
	const ordered = $derived(pending ? applyMove(epics(), pending.id, pending.beforeId) : epics());

	return {
		get epics() {
			return ordered;
		},
		async move(id: string, beforeId: string | null) {
			if (planMove(epics(), id, beforeId) === undefined) return;
			pending = { id, beforeId };
			await runOperation('move_epic', { epic: id, beforeEpic: beforeId });
			pending = null;
		}
	};
}
