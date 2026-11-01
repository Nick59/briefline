export const STAGES = ['dev', 'test', 'deploy'] as const;
export type Stage = (typeof STAGES)[number];

export const WORK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const QUESTION_STATUSES = ['open', 'answered', 'ignored'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

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

export const PROFILE_ROLES = [
	'developer',
	'product_owner',
	'designer',
	'qa',
	'manager',
	'other'
] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

export const PROFILE_ROLE_LABELS: Record<ProfileRole, string> = {
	developer: 'Developer',
	product_owner: 'Product owner',
	designer: 'Designer',
	qa: 'QA / tester',
	manager: 'Manager',
	other: 'Other'
};

export const CODING_LEVELS = ['none', 'beginner', 'intermediate', 'expert'] as const;
export type CodingLevel = (typeof CODING_LEVELS)[number];

export const CODING_LEVEL_LABELS: Record<CodingLevel, { label: string; hint: string }> = {
	none: { label: 'None', hint: "I don't read code" },
	beginner: { label: 'Beginner', hint: 'I can follow simple code with explanations' },
	intermediate: { label: 'Intermediate', hint: 'I read code comfortably' },
	expert: { label: 'Expert', hint: 'I write and review code every day' }
};

/** An agent seen within this time is online; up to PRESENCE_OFFLINE_MS it was last seen; after that it is offline. */
export const PRESENCE_ONLINE_MS = 5 * 60_000;
export const PRESENCE_OFFLINE_MS = 20 * 60_000;
/** Longest wait between database writes, and between presence events, for an agent that stays online. */
export const PRESENCE_THROTTLE_MS = 30_000;
