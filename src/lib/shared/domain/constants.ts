export const STAGES = ['dev', 'test', 'deploy'] as const;
export type Stage = (typeof STAGES)[number];

export const WORK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SPEC_KINDS = ['spec', 'plan', 'design', 'adr', 'notes', 'prompt'] as const;
export type SpecKind = (typeof SPEC_KINDS)[number];

export const EFFORTS = ['S', 'M', 'L', 'XL'] as const;
export type Effort = (typeof EFFORTS)[number];

export const SYNC_JOB_STATUSES = ['pending', 'succeeded', 'failed', 'skipped'] as const;
export type SyncJobStatus = (typeof SYNC_JOB_STATUSES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
	dev: 'Dev',
	test: 'Tests',
	deploy: 'Deploy'
};

export const STATUS_LABELS: Record<WorkStatus, string> = {
	todo: 'To do',
	in_progress: 'In progress',
	done: 'Done'
};

export const PRIORITY_LABELS: Record<Priority, string> = {
	low: 'Low',
	medium: 'Medium',
	high: 'High',
	urgent: 'Urgent'
};

export const SPEC_KIND_LABELS: Record<SpecKind, string> = {
	spec: 'Spec',
	plan: 'Plan',
	design: 'Design',
	adr: 'ADR',
	notes: 'Notes',
	prompt: 'Prompt'
};

export const MAPPING_KEYS = ['not_started', ...STAGES, 'done'] as const;
export type MappingKey = (typeof MAPPING_KEYS)[number];

export const MAPPING_LABELS: Record<MappingKey, string> = {
	not_started: 'Not started',
	...STAGE_LABELS,
	done: 'Done'
};
