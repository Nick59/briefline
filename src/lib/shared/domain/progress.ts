import { STAGES, type Stage, type WorkStatus } from './constants.ts';
import type { Progress, StageStatuses, StatusCounts } from './types.ts';

const STATUS_WEIGHT: Record<WorkStatus, number> = { todo: 0, in_progress: 0.5, done: 1 };

function emptyCounts(): StatusCounts {
	return { todo: 0, in_progress: 0, done: 0, total: 0, percent: 0 };
}

function percentOf(counts: StatusCounts): number {
	if (counts.total === 0) return 0;
	const score = counts.in_progress * STATUS_WEIGHT.in_progress + counts.done;
	return Math.round((score / counts.total) * 100);
}

export function statusFromCounts(
	counts: Pick<StatusCounts, 'todo' | 'in_progress' | 'done' | 'total'>
): WorkStatus {
	if (counts.total > 0 && counts.done === counts.total) return 'done';
	if (counts.in_progress > 0 || counts.done > 0) return 'in_progress';
	return 'todo';
}

/** A task is finished only when its last stage (deploy) is done. */
export function taskOverallStatus(stages: StageStatuses): WorkStatus {
	const values = STAGES.map((s) => stages[s]);
	if (values.every((v) => v === 'done')) return 'done';
	if (values.some((v) => v !== 'todo')) return 'in_progress';
	return 'todo';
}

export function taskCurrentStage(stages: StageStatuses): Stage | null {
	return STAGES.find((s) => stages[s] !== 'done') ?? null;
}

/** The stage that colors an in-progress epic; dev keeps the plain in-progress color. */
export function epicDisplayStage(
	progress: Pick<Progress, 'status' | 'currentStage'>
): Stage | null {
	return progress.status === 'in_progress' &&
		progress.currentStage &&
		progress.currentStage !== 'dev'
		? progress.currentStage
		: null;
}

export function computeProgress(
	all: { stages: StageStatuses; cancelledAt?: string | null }[]
): Progress {
	const items = all.filter((item) => !item.cancelledAt);
	const stages = Object.fromEntries(STAGES.map((s) => [s, emptyCounts()])) as Record<
		Stage,
		StatusCounts
	>;

	for (const item of items) {
		for (const stage of STAGES) {
			const counts = stages[stage];
			counts[item.stages[stage]] += 1;
			counts.total += 1;
		}
	}
	for (const stage of STAGES) stages[stage].percent = percentOf(stages[stage]);

	const percent =
		items.length === 0
			? 0
			: Math.round(STAGES.reduce((sum, s) => sum + stages[s].percent, 0) / STAGES.length);

	const overall = emptyCounts();
	for (const item of items) {
		overall[taskOverallStatus(item.stages)] += 1;
		overall.total += 1;
	}

	return {
		stages,
		percent,
		status: statusFromCounts(overall),
		currentStage:
			items.length === 0 ? null : (STAGES.find((s) => stages[s].done < stages[s].total) ?? null)
	};
}
