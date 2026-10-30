import type {
	Effort,
	MappingKey,
	Priority,
	SpecKind,
	Stage,
	SyncJobStatus,
	WorkStatus
} from './constants.ts';

export type ISODate = string;

export interface ExternalRef {
	provider: string;
	key: string;
	url: string | null;
}

export interface MappedState {
	id: string;
	name: string;
}

export type StatusMapping = Partial<Record<MappingKey, MappedState>>;

export interface ProjectTicketing {
	connectionId: string | null;
	/** Provider of the selected connection. */
	provider: string | null;
	/** Project-level provider fields, such as a Plane project id. */
	target: Record<string, string>;
	statusMapping: StatusMapping;
	autoSync: boolean;
	postComments: boolean;
}

export type SecretSource = 'stored' | 'env' | 'none';

/** A custom header of a connection. Only the name is exposed; the value is stored encrypted. */
export interface TicketingConnectionHeader {
	name: string;
	hasValue: boolean;
}

/** A configured account in an external ticketing system. The secret itself is never exposed. */
export interface TicketingConnection {
	id: string;
	name: string;
	provider: string;
	settings: Record<string, string>;
	/** True when an encrypted API key is stored for this connection. */
	hasSecret: boolean;
	secretSource: SecretSource;
	/** An API key is stored but cannot be decrypted: the server secret key changed or is missing. */
	secretUnreadable: boolean;
	/** Custom headers are stored but cannot be decrypted. `headers` is empty in that case. */
	headersUnreadable: boolean;
	headers: TicketingConnectionHeader[];
	usedBy: { key: string; name: string }[];
	createdAt: ISODate;
	updatedAt: ISODate;
}

export interface TicketingState {
	id: string;
	name: string;
	group?: string;
}

export interface Project {
	id: string;
	key: string;
	name: string;
	description: string;
	ticketing: ProjectTicketing;
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

export type StageStatuses = Record<Stage, WorkStatus>;

export interface Task {
	id: string;
	epicId: string;
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

export interface Page<T> {
	items: T[];
	total: number;
}

export interface PageView<T> extends Page<T> {
	page: number;
	pageCount: number;
	pageSize: number;
}

export interface Activity {
	id: string;
	projectId: string;
	epicId: string | null;
	taskId: string | null;
	actor: string;
	action: string;
	message: string;
	data: Record<string, unknown>;
	/** The external ticket of the task, or of the epic for epic events, when one is linked. */
	ticket?: ExternalRef;
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
	/** Non-fatal remark about a successful push, e.g. that a mapped state was missing. */
	message: string | null;
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

export interface EpicSummary extends Epic {
	progress: Progress;
	taskCount: number;
}

export interface EpicDetail extends Epic {
	project: Pick<Project, 'id' | 'key' | 'name'>;
	progress: Progress;
	tasks: Task[];
	specs: SpecSummary[];
}

export interface ProjectSummary extends Project {
	epicCount: number;
	progress: Progress;
}

export interface TaskDetail extends Task {
	epic: Pick<Epic, 'id' | 'key' | 'title' | 'projectId' | 'externalRef'>;
	project: Pick<Project, 'id' | 'key' | 'name'>;
	specs: SpecSummary[];
}

export interface ProviderSetting {
	name: string;
	label: string;
	required: boolean;
	/** connection: shared by every project using the connection; project: set per project. */
	scope: 'connection' | 'project';
	placeholder?: string;
	help?: string;
	/** The value can be picked from the external system's projects (list_ticketing_projects). */
	picker?: 'projects';
}

export interface TicketingProject {
	id: string;
	name: string;
	identifier: string;
}

export interface TicketProviderInfo {
	id: string;
	label: string;
	description: string;
	settings: ProviderSetting[];
	/** Environment variables used as a fallback when a connection has no stored credentials. */
	envVars: string[];
	/** Label of the API key field, or null when the provider needs no secret. */
	secretLabel: string | null;
	/** Environment variable holding the API key when none is stored. */
	secretEnvVar: string | null;
	/** False when the provider has no states that Briefline statuses can map to. */
	supportsStates: boolean;
	/** True when the provider can list its projects for the project target field. */
	supportsProjects: boolean;
}
