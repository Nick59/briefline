import { STAGES, type Stage } from '#lib/shared/domain/constants.ts';
import type { Progress } from '#lib/shared/domain/types.ts';

export function initialStage(progress: Progress): Stage {
	if (STAGES.every((s) => progress.stages[s].total === 0)) return STAGES[0];
	return (
		STAGES.find((s) => progress.stages[s].done < progress.stages[s].total) ??
		STAGES[STAGES.length - 1]
	);
}
