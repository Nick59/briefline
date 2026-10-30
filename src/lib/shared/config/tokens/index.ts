import type { Priority, Stage, WorkStatus } from '#lib/shared/domain/constants.ts';
import { taskCurrentStage, taskOverallStatus } from '#lib/shared/domain/progress.ts';
import type { StageStatuses } from '#lib/shared/domain/types.ts';

/**
 * A tone is a semantic color token. Components receive a tone and turn it into classes,
 * so the palette can change in tokens.css without touching any component.
 */
export type Tone =
	| 'neutral'
	| 'status-todo'
	| 'status-in-progress'
	| 'status-done'
	| 'stage-dev'
	| 'stage-test'
	| 'stage-deploy'
	| 'priority-low'
	| 'priority-medium'
	| 'priority-high'
	| 'priority-urgent'
	| 'success'
	| 'warning'
	| 'danger'
	| 'brand';

export const statusTone: Record<WorkStatus, Tone> = {
	todo: 'status-todo',
	in_progress: 'status-in-progress',
	done: 'status-done'
};

export const stageTone: Record<Stage, Tone> = {
	dev: 'stage-dev',
	test: 'stage-test',
	deploy: 'stage-deploy'
};

export const priorityTone: Record<Priority, Tone> = {
	low: 'priority-low',
	medium: 'priority-medium',
	high: 'priority-high',
	urgent: 'priority-urgent'
};

/** CSS custom property for a tone, for inline styles such as SVG strokes. */
export const toneVar = (tone: Tone) =>
	tone === 'neutral' ? 'var(--muted-foreground)' : `var(--${tone})`;

/** Full class strings so Tailwind can see them at build time. */
export const toneClasses: Record<
	Tone,
	{ text: string; bg: string; soft: string; border: string; dot: string }
> = {
	neutral: {
		text: 'text-muted-foreground',
		bg: 'bg-muted-foreground',
		soft: 'bg-muted text-muted-foreground',
		border: 'border-border',
		dot: 'bg-muted-foreground'
	},
	'status-todo': {
		text: 'text-status-todo',
		bg: 'bg-status-todo',
		soft: 'bg-status-todo/12 text-muted-foreground',
		border: 'border-status-todo/40',
		dot: 'bg-status-todo'
	},
	'status-in-progress': {
		text: 'text-status-in-progress',
		bg: 'bg-status-in-progress',
		soft: 'bg-status-in-progress/12 text-status-in-progress',
		border: 'border-status-in-progress/40',
		dot: 'bg-status-in-progress'
	},
	'status-done': {
		text: 'text-status-done',
		bg: 'bg-status-done',
		soft: 'bg-status-done/12 text-status-done',
		border: 'border-status-done/40',
		dot: 'bg-status-done'
	},
	'stage-dev': {
		text: 'text-stage-dev',
		bg: 'bg-stage-dev',
		soft: 'bg-stage-dev/12 text-stage-dev',
		border: 'border-stage-dev/40',
		dot: 'bg-stage-dev'
	},
	'stage-test': {
		text: 'text-stage-test',
		bg: 'bg-stage-test',
		soft: 'bg-stage-test/14 text-stage-test',
		border: 'border-stage-test/40',
		dot: 'bg-stage-test'
	},
	'stage-deploy': {
		text: 'text-stage-deploy',
		bg: 'bg-stage-deploy',
		soft: 'bg-stage-deploy/12 text-stage-deploy',
		border: 'border-stage-deploy/40',
		dot: 'bg-stage-deploy'
	},
	'priority-low': {
		text: 'text-priority-low',
		bg: 'bg-priority-low',
		soft: 'bg-priority-low/12 text-muted-foreground',
		border: 'border-priority-low/40',
		dot: 'bg-priority-low'
	},
	'priority-medium': {
		text: 'text-priority-medium',
		bg: 'bg-priority-medium',
		soft: 'bg-priority-medium/12 text-priority-medium',
		border: 'border-priority-medium/40',
		dot: 'bg-priority-medium'
	},
	'priority-high': {
		text: 'text-priority-high',
		bg: 'bg-priority-high',
		soft: 'bg-priority-high/12 text-priority-high',
		border: 'border-priority-high/40',
		dot: 'bg-priority-high'
	},
	'priority-urgent': {
		text: 'text-priority-urgent',
		bg: 'bg-priority-urgent',
		soft: 'bg-priority-urgent/12 text-priority-urgent',
		border: 'border-priority-urgent/40',
		dot: 'bg-priority-urgent'
	},
	success: {
		text: 'text-success',
		bg: 'bg-success',
		soft: 'bg-success/12 text-success',
		border: 'border-success/40',
		dot: 'bg-success'
	},
	warning: {
		text: 'text-warning',
		bg: 'bg-warning',
		soft: 'bg-warning/14 text-warning',
		border: 'border-warning/40',
		dot: 'bg-warning'
	},
	danger: {
		text: 'text-danger',
		bg: 'bg-danger',
		soft: 'bg-danger/12 text-danger',
		border: 'border-danger/40',
		dot: 'bg-danger'
	},
	brand: {
		text: 'text-brand',
		bg: 'bg-brand',
		soft: 'bg-brand/12 text-brand',
		border: 'border-brand/40',
		dot: 'bg-brand'
	}
};

/** Subtle row/card tint: faint background, stronger on hover, and a left accent. */
const tintClasses = {
	'status-in-progress':
		'bg-status-in-progress/10 hover:bg-status-in-progress/15 border-l-[3px] border-l-status-in-progress hover:border-l-status-in-progress',
	'status-done':
		'bg-status-done/8 hover:bg-status-done/12 border-l-[3px] border-l-status-done/70 hover:border-l-status-done/70',
	'stage-test':
		'bg-stage-test/10 hover:bg-stage-test/15 border-l-[3px] border-l-stage-test hover:border-l-stage-test',
	'stage-deploy':
		'bg-stage-deploy/10 hover:bg-stage-deploy/15 border-l-[3px] border-l-stage-deploy hover:border-l-stage-deploy'
} as const;

/** Tone a task is tinted with, or null for a task that has not started. */
export function taskTintTone(stages: StageStatuses): keyof typeof tintClasses | null {
	const status = taskOverallStatus(stages);
	if (status === 'todo') return null;
	if (status === 'done') return statusTone.done as 'status-done';
	const stage = taskCurrentStage(stages);
	if (stage === 'test' || stage === 'deploy')
		return stageTone[stage] as 'stage-test' | 'stage-deploy';
	return statusTone.in_progress as 'status-in-progress';
}

export function taskTintClass(stages: StageStatuses): string {
	const tone = taskTintTone(stages);
	return tone ? tintClasses[tone] : '';
}
