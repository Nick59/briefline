import type {
	CodingLevel,
	Effort,
	MappingKey,
	Priority,
	ProfileRole,
	QuestionStatus,
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
	position: number;
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
	/** Number of comments on the task. */
	commentCount: number;
	createdAt: ISODate;
	updatedAt: ISODate;
}

export interface TaskComment {
	id: string;
	taskId: string;
	author: string;
	/** Fixed when written, so a profile rename keeps a person's comments theirs. */
	authorKind: 'human' | 'agent';
	/** Markdown. */
	body: string;
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
	/** Null for a project spec. */
	epicId: string | null;
	/** Set only for a project spec. */
	projectId: string | null;
	taskId: string | null;
	title: string;
	kind: SpecKind;
	content: string;
	brief: HumanBrief | null;
	position: number;
	/** Set when a person has opened the spec in the dashboard; cleared when its content changes. */
	viewedAt: ISODate | null;
	createdAt: ISODate;
	updatedAt: ISODate;
}

export interface QuestionMessage {
	id: string;
	questionId: string;
	author: string;
	/** Markdown. */
	body: string;
	createdAt: ISODate;
}

export interface EpicQuestion {
	id: string;
	epicId: string;
	position: number;
	/** Markdown. */
	question: string;
	/** Markdown. */
	context: string | null;
	/** Suggested answers. */
	options: string[];
	status: QuestionStatus;
	answer: string | null;
	askedBy: string;
	answeredBy: string | null;
	createdAt: ISODate;
	answeredAt: ISODate | null;
	/** Replies to the thread, oldest first. */
	messages: QuestionMessage[];
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
	/** Keys of what moved, for links; each is null once that entity is deleted, and the whole target is null when the project is gone. */
	target: { projectKey: string; epicKey: string | null; taskKey: string | null } | null;
	/** The agent session that made the change; null for the dashboard, the REST API and older entries. */
	sessionId: string | null;
	createdAt: ISODate;
}

export interface SessionRecap {
	stageChanges: number;
	/** Tasks whose last stage (deploy) was moved to done. */
	tasksDone: number;
	tasksCreated: number;
	epicsCreated: number;
	specsAdded: number;
	specsUpdated: number;
	threadsOpened: number;
	replies: number;
	answers: number;
	images: number;
}

export interface SessionSummary {
	id: string;
	actor: string;
	clientName: string | null;
	clientVersion: string | null;
	/** Markdown recap written by the agent. */
	summary: string | null;
	startedAt: ISODate;
	lastSeenAt: ISODate;
	endedAt: ISODate | null;
	activityCount: number;
	projects: { id: string; key: string; name: string }[];
	recap: SessionRecap;
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
	openQuestions: number;
	questionCount: number;
}

export interface EpicDetail extends Epic {
	project: Pick<Project, 'id' | 'key' | 'name'>;
	progress: Progress;
	tasks: Task[];
	specs: SpecSummary[];
	questions: EpicQuestion[];
	openQuestions: number;
	questionCount: number;
}

export interface ProjectSummary extends Project {
	epicCount: number;
	progress: Progress;
}

export interface TaskDetail extends Task {
	epic: Pick<Epic, 'id' | 'key' | 'title' | 'projectId' | 'externalRef'>;
	project: Pick<Project, 'id' | 'key' | 'name'>;
	specs: SpecSummary[];
	comments: TaskComment[];
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

export interface UserProfile {
	name: string;
	role: ProfileRole;
	roleOther: string | null;
	codingLevel: CodingLevel;
	language: string | null;
	updatedAt: ISODate;
}

export interface UserProfileView {
	profile: UserProfile | null;
	/** How agents should write for this user; null until a profile is set. */
	guidance: string | null;
}
