import { z } from 'zod';
import { PRIORITIES, SPEC_KINDS, STAGES, WORK_STATUSES } from './constants.ts';

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
			.describe('Ticket provider id, e.g. github, jira, linear, webhook, dry-run'),
		key: text(200)
			.min(1)
			.describe('Ticket identifier in the provider, e.g. PROJ-12 or owner/repo#42'),
		url: z.url().nullable().optional()
	})
	.describe('Link to a ticket in an external system');

export const ticketingConfigSchema = z.object({
	provider: text(40).min(1),
	settings: z.record(z.string(), z.string().max(500)).default({}),
	autoSync: z.boolean().default(true),
	postComments: z.boolean().default(true)
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
	description: text(5000),
	ticketing: ticketingConfigSchema.nullable()
};

export const createProjectSchema = z.object({
	key: projectKey,
	...projectFields,
	description: projectFields.description.default(''),
	ticketing: projectFields.ticketing.optional()
});

export const updateProjectSchema = z.object(projectFields).partial();

const taskFields = {
	title: text(200).min(1),
	description: text(50_000).describe('Markdown description, usually written by an AI agent'),
	summary: text(500).describe('One-line, plain-language summary for humans'),
	phaseId: z.string().nullable().describe('Phase id or name inside the same epic'),
	priority: prioritySchema,
	assignee: text(120).nullable(),
	stages: z.partialRecord(stageSchema, workStatusSchema),
	externalRef: externalRefSchema.nullable()
};

export const createTaskSchema = z.object({
	...taskFields,
	description: taskFields.description.default(''),
	summary: taskFields.summary.default(''),
	phaseId: taskFields.phaseId.optional(),
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

export const createSpecSchema = z.object({
	...specFields,
	kind: specFields.kind.default('spec'),
	content: specFields.content.default('')
});

export const updateSpecSchema = z
	.object({ ...specFields, position: z.number().int().min(0) })
	.partial();

const phaseFields = {
	name: text(120).min(1),
	description: text(5000),
	startDate: isoDate.nullable(),
	endDate: isoDate.nullable(),
	status: workStatusSchema,
	position: z.number().int().min(0)
};

export const createPhaseSchema = z.object({
	...phaseFields,
	description: phaseFields.description.default(''),
	startDate: nullableDate,
	endDate: nullableDate,
	status: phaseFields.status.optional(),
	position: phaseFields.position.optional()
});

export const updatePhaseSchema = z.object(phaseFields).partial();

const planTaskSchema = createTaskSchema.omit({ phaseId: true }).extend({
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
	phases: z
		.array(
			createPhaseSchema
				.omit({ position: true })
				.extend({ tasks: z.array(planTaskSchema).max(200).optional() })
		)
		.max(30)
		.optional()
		.describe('Ordered timeline phases, each with optional tasks'),
	specs: z.array(createSpecSchema).max(20).optional().describe('Specs attached to the epic')
});

export const updateEpicSchema = z.object(epicFields).partial();

export const listTasksQuerySchema = z.object({
	stage: stageSchema.optional(),
	status: workStatusSchema.optional(),
	phaseId: z.string().optional()
});

export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;
export type CreateEpicInput = z.input<typeof createEpicSchema>;
export type UpdateEpicInput = z.input<typeof updateEpicSchema>;
export type CreatePhaseInput = z.input<typeof createPhaseSchema>;
export type UpdatePhaseInput = z.input<typeof updatePhaseSchema>;
export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
export type SetStageStatusInput = z.input<typeof setStageStatusSchema>;
export type MoveTaskInput = z.input<typeof moveTaskSchema>;
export type CreateSpecInput = z.input<typeof createSpecSchema>;
export type UpdateSpecInput = z.input<typeof updateSpecSchema>;
export type TicketingConfigInput = z.input<typeof ticketingConfigSchema>;
