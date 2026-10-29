import type { Effort, Priority, SpecKind, Stage, SyncJobStatus, WorkStatus } from './constants.ts';

export type ISODate = string;

export interface ExternalRef {
	provider: string;
	key: string;
	url: string | null;
}

export interface TicketingConfig {
	provider: string;
	settings: Record<string, string>;
	autoSync: boolean;
	postComments: boolean;
}

export interface Project {
	id: string;
	key: string;
	name: string;
	description: string;
	ticketing: TicketingConfig | null;
	createdAt: ISODate;
	updatedAt: ISODate;
}

export interface Epic {
	id: string;
	projectId: string;
	key: string;
	title: string;
	summary: string;
	externalRef: ExternalRef | null;
	targetDate: ISODate | null;
	createdAt: ISODate;
	updatedAt: ISODate;
}

export interface Phase {
	id: string;
	epicId: string;
	name: string;
	description: string;
	position: number;
	startDate: ISODate | null;
	endDate: ISODate | null;
	/** Used only while the phase has no tasks; otherwise the status is derived. */
	status: WorkStatus;
	createdAt: ISODate;
	updatedAt: ISODate;
}

export type StageStatuses = Record<Stage, WorkStatus>;

export interface Task {
	id: string;
	epicId: string;
	phaseId: string | null;
	key: string;
	title: string;
	description: string;
	summary: string;
	priority: Priority;
	assignee: string | null;
	stages: StageStatuses;
	externalRef: ExternalRef | null;
	position: number;
	createdAt: ISODate;
	updatedAt: ISODate;
}

export interface HumanBrief {
	summary: string;
	whyItMatters: string;
	whatChanges: string[];
	acceptance: string[];
	risks: string[];
	openQuestions: string[];
	glossary: { term: string; meaning: string }[];
	effort: Effort;
	readingMinutes: number;
	source: string;
	generatedAt: ISODate;
}

export interface Spec {
	id: string;
	epicId: string;
	taskId: string | null;
	title: string;
	kind: SpecKind;
	content: string;
	brief: HumanBrief | null;
	position: number;
	createdAt: ISODate;
	updatedAt: ISODate;
}

export type SpecSummary = Omit<Spec, 'content' | 'brief'> & { hasBrief: boolean };

export interface Activity {
	id: string;
	projectId: string;
	epicId: string | null;
	taskId: string | null;
	actor: string;
	action: string;
	message: string;
	data: Record<string, unknown>;
	createdAt: ISODate;
}

export interface SyncJob {
	id: string;
	projectId: string;
	epicId: string | null;
	taskId: string | null;
	provider: string;
	operation: string;
	payload: Record<string, unknown>;
	status: SyncJobStatus;
	attempts: number;
	lastError: string | null;
	createdAt: ISODate;
	updatedAt: ISODate;
}

export interface StatusCounts {
	todo: number;
	in_progress: number;
	done: number;
	total: number;
	percent: number;
}

export interface Progress {
	stages: Record<Stage, StatusCounts>;
	percent: number;
	status: WorkStatus;
	/** The earliest stage that is not finished, or null when everything shipped. */
	currentStage: Stage | null;
}

export interface PhaseWithProgress extends Phase {
	effectiveStatus: WorkStatus;
	progress: Progress;
	taskIds: string[];
}

export interface EpicSummary extends Epic {
	progress: Progress;
	taskCount: number;
	phaseCount: number;
}

export interface EpicDetail extends Epic {
	project: Pick<Project, 'id' | 'key' | 'name'>;
	progress: Progress;
	phases: PhaseWithProgress[];
	tasks: Task[];
	specs: SpecSummary[];
}

export interface ProjectSummary extends Project {
	epicCount: number;
	progress: Progress;
}

export interface TaskDetail extends Task {
	epic: Pick<Epic, 'id' | 'key' | 'title' | 'projectId'>;
	project: Pick<Project, 'id' | 'key' | 'name'>;
	phase: Pick<Phase, 'id' | 'name'> | null;
	specs: SpecSummary[];
}

export interface ProviderSetting {
	name: string;
	label: string;
	required: boolean;
	placeholder?: string;
	help?: string;
}

export interface TicketProviderInfo {
	id: string;
	label: string;
	description: string;
	settings: ProviderSetting[];
	/** Secrets are read from these environment variables, never stored in the database. */
	envVars: string[];
}
