import { z } from 'zod';
import {
	CODING_LEVELS,
	EFFORTS,
	PRIORITIES,
	PROFILE_ROLES,
	QUESTION_STATUSES,
	SPEC_KINDS,
	STAGES,
	WORK_STATUSES
} from './constants.ts';

const text = (max: number) => z.string().trim().max(max);
const isoDate = z.iso.date().describe('Date as YYYY-MM-DD');
const nullableDate = isoDate.nullable().optional();

export const stageSchema = z.enum(STAGES).describe('Delivery stage: dev, test or deploy');
export const workStatusSchema = z.enum(WORK_STATUSES).describe('todo, in_progress or done');
export const prioritySchema = z.enum(PRIORITIES);
export const specKindSchema = z.enum(SPEC_KINDS);

export const externalRefSchema = z
	.object({
		provider: text(40)
			.min(1)
			.describe('Ticket provider id, e.g. github, jira, linear, plane, webhook, dry-run'),
		key: text(200)
			.min(1)
			.describe('Ticket identifier in the provider, e.g. PROJ-12 or owner/repo#42'),
		url: z.url().nullable().optional()
	})
	.describe('Link to a ticket in an external system');

const settingsRecord = z
	.record(z.string(), text(500))
	.describe('Provider fields as name/value strings; see list_ticket_providers for the names');

export const mappedStateSchema = z.object({
	id: text(200).min(1).describe('State id in the external system'),
	name: text(200).describe('State name, kept for display')
});

export const statusMappingSchema = z
	.object({
		not_started: mappedStateSchema,
		dev: mappedStateSchema,
		test: mappedStateSchema,
		deploy: mappedStateSchema,
		done: mappedStateSchema
	})
	.partial()
	.describe('External state per Briefline status. Omitted keys use the provider default.');

const headersInput = z
	.array(
		z.object({
			name: text(200).min(1).describe('Header name, e.g. CF-Access-Client-Id'),
			value: text(4096)
				.optional()
				.describe(
					'Header value. Omit or leave empty to keep the stored value of an existing header.'
				)
		})
	)
	.max(20)
	.describe(
		'Custom HTTP headers sent with every request to the provider, stored encrypted. The full list: headers left out are removed. Values are never returned.'
	);

const connectionFields = {
	name: text(120).min(1),
	settings: settingsRecord,
	secret: text(2000).describe(
		'API key or token. Write-only: it is stored encrypted, never returned.'
	),
	headers: headersInput
};

export const createTicketingConnectionSchema = z.object({
	name: connectionFields.name,
	provider: text(40).min(1).describe('Provider id from list_ticket_providers'),
	settings: connectionFields.settings.default({}),
	secret: connectionFields.secret.optional(),
	headers: connectionFields.headers.optional()
});

export const updateTicketingConnectionSchema = z
	.object({
		...connectionFields,
		clearSecret: z.literal(true).describe('Removes the stored secret')
	})
	.partial();

export const setProjectTicketingSchema = z.object({
	connectionId: z.string().min(1).nullable().describe('Connection id, or null to disconnect'),
	target: settingsRecord.optional().describe('Project-level provider fields'),
	statusMapping: statusMappingSchema.optional(),
	autoSync: z.boolean().optional(),
	postComments: z.boolean().optional()
});

const projectKey = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Use 2-10 letters or digits, starting with a letter')
	.describe('Short project key used to build epic and task keys, e.g. PMA');

// Update schemas are built from field sets without defaults: in zod 4 a default still
// fills an omitted optional field, which would overwrite stored values on a partial update.
const projectFields = {
	name: text(120).min(1),
	description: text(5000)
};

export const createProjectSchema = z.object({
	key: projectKey,
	...projectFields,
	description: projectFields.description.default('')
});

export const updateProjectSchema = z.object(projectFields).partial();

const taskFields = {
	title: text(200).min(1),
	description: text(50_000).describe('Markdown description, usually written by an AI agent'),
	summary: text(500).describe('One-line, plain-language summary for humans'),
	priority: prioritySchema,
	assignee: text(120).nullable(),
	stages: z.partialRecord(stageSchema, workStatusSchema),
	externalRef: externalRefSchema.nullable()
};

export const createTaskSchema = z.object({
	...taskFields,
	description: taskFields.description.default(''),
	summary: taskFields.summary.default(''),
	priority: taskFields.priority.default('medium'),
	assignee: taskFields.assignee.optional(),
	stages: taskFields.stages.optional(),
	externalRef: taskFields.externalRef.optional()
});

export const updateTaskSchema = z
	.object({ ...taskFields, position: z.number().int().min(0) })
	.partial();

export const setStageStatusSchema = z.object({
	stage: stageSchema,
	status: workStatusSchema,
	note: text(2000)
		.optional()
		.describe('Optional note recorded in the activity log and ticket comment')
});

export const briefSchema = z.object({
	summary: z.string().describe('Two sentences a product manager understands, no jargon'),
	whyItMatters: z.string().describe('The user or business reason for this work'),
	whatChanges: z
		.array(z.string())
		.describe('What will be different once this ships, from the user point of view'),
	acceptance: z.array(z.string()).describe('How a human can check that it is done'),
	risks: z.array(z.string()),
	openQuestions: z.array(z.string()).describe('Decisions a human still needs to make'),
	glossary: z
		.array(z.object({ term: z.string(), meaning: z.string() }))
		.describe('Technical terms used, explained simply'),
	effort: z.enum(EFFORTS).describe('T-shirt size of the work: S, M, L or XL'),
	readingMinutes: z
		.number()
		.int()
		.min(0)
		.describe('Minutes to read the spec, about its word count divided by 200')
});

const optionalBrief = briefSchema
	.optional()
	.describe('Plain-language brief of the spec content, written for non-engineers');

const specFields = {
	title: text(200).min(1),
	kind: specKindSchema,
	content: text(200_000).describe(
		'Markdown content. ```mermaid code blocks are rendered as diagrams.'
	)
};

export const moveTaskSchema = z.object({
	epic: z.string().min(1).optional().describe('Destination epic in the same project'),
	stage: stageSchema.optional().describe('Stage whose status changes; requires status'),
	status: workStatusSchema.optional(),
	beforeTask: z
		.string()
		.nullable()
		.optional()
		.describe('Place the task just before this task (id or key); null puts it last'),
	note: text(2000).optional()
});

export const moveProjectSchema = z.object({
	beforeProject: z
		.string()
		.nullable()
		.optional()
		.describe('Place the project just before this project (id or key); omit or null puts it last')
});

export const createSpecSchema = z.object({
	...specFields,
	kind: specFields.kind.default('spec'),
	content: specFields.content.default(''),
	brief: optionalBrief
});

export const updateSpecSchema = z
	.object({ ...specFields, position: z.number().int().min(0), brief: optionalBrief })
	.partial();

const questionFields = {
	question: text(5000).min(1).describe('The question, markdown'),
	context: text(10000).nullable().describe('Why you ask and what depends on it, markdown'),
	options: z
		.array(text(500).min(1))
		.max(10)
		.describe('Suggested answers a person can pick; optional')
};

export const addEpicQuestionsSchema = z.object({
	questions: z
		.array(
			z.object({
				...questionFields,
				context: questionFields.context.optional(),
				options: questionFields.options.optional()
			})
		)
		.min(1)
		.max(20)
		.describe('One or more questions to ask in one call')
});

export const questionStatusSchema = z.enum(QUESTION_STATUSES);
export const replyToQuestionSchema = z.object({
	body: text(10000).min(1).describe('The reply, markdown')
});
export const taskCommentSchema = z.object({
	body: text(10000).min(1).describe('The comment, markdown')
});
export const attachmentTargetSchema = z
	.object({
		type: z.enum(['project', 'task', 'spec']).describe('What the image belongs to'),
		id: z.string().min(1).describe('Project, task or spec id or key')
	})
	.describe('Where the image lives; it is deleted together with this project, task or spec');
export const uploadAttachmentSchema = z.object({
	target: attachmentTargetSchema,
	filename: z.string().min(1).max(500).describe('File name, e.g. screenshot.png'),
	mime: z.string().optional().describe('Ignored; the type is detected from the image bytes'),
	data: z.string().min(1).describe('The image file, base64 encoded (PNG, JPEG, GIF or WebP)')
});
export const answerQuestionSchema = z.object({ answer: text(10000).min(1) });
export const updateQuestionSchema = z
	.object({
		question: questionFields.question,
		context: questionFields.context,
		options: questionFields.options
	})
	.partial();

export const setSpecBriefSchema = z.object({ brief: briefSchema });

const planTaskSchema = createTaskSchema.extend({
	specs: z.array(createSpecSchema).max(20).optional()
});

const epicFields = {
	title: text(200).min(1),
	summary: text(5000),
	targetDate: isoDate.nullable(),
	externalRef: externalRefSchema.nullable()
};

export const createEpicSchema = z.object({
	...epicFields,
	summary: epicFields.summary.default(''),
	targetDate: nullableDate,
	externalRef: epicFields.externalRef.optional(),
	tasks: z
		.array(planTaskSchema)
		.max(200)
		.optional()
		.describe('Ordered tasks, each with optional specs'),
	specs: z.array(createSpecSchema).max(20).optional().describe('Specs attached to the epic')
});

export const updateEpicSchema = z.object(epicFields).partial();

export const listTasksQuerySchema = z.object({
	stage: stageSchema.optional(),
	status: workStatusSchema.optional()
});

export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;
export type CreateEpicInput = z.input<typeof createEpicSchema>;
export type UpdateEpicInput = z.input<typeof updateEpicSchema>;
export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
export type SetStageStatusInput = z.input<typeof setStageStatusSchema>;
export type MoveProjectInput = z.input<typeof moveProjectSchema>;
export type MoveTaskInput = z.input<typeof moveTaskSchema>;
export type BriefInput = z.infer<typeof briefSchema>;
export type SetSpecBriefInput = z.input<typeof setSpecBriefSchema>;
export type AddEpicQuestionsInput = z.input<typeof addEpicQuestionsSchema>;
export type UpdateQuestionInput = z.input<typeof updateQuestionSchema>;
export type CreateSpecInput = z.input<typeof createSpecSchema>;
export type UpdateSpecInput = z.input<typeof updateSpecSchema>;
export type CreateTicketingConnectionInput = z.input<typeof createTicketingConnectionSchema>;
export type UpdateTicketingConnectionInput = z.input<typeof updateTicketingConnectionSchema>;
export type SetProjectTicketingInput = z.input<typeof setProjectTicketingSchema>;

export const userProfileSchema = z.object({
	name: text(80).min(1).describe('How agents should address the user'),
	role: z.enum(PROFILE_ROLES),
	roleOther: text(80).optional().describe('Describes the role when role is "other"'),
	codingLevel: z.enum(CODING_LEVELS).describe('How comfortable the user is reading code'),
	language: text(60).optional().describe('Preferred language for briefs, e.g. English or French')
});

export type UserProfileInput = z.infer<typeof userProfileSchema>;
