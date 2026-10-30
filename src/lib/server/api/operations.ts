import { z } from 'zod';
import {
	createEpicSchema,
	createProjectSchema,
	createTicketingConnectionSchema,
	createSpecSchema,
	setSpecBriefSchema,
	createTaskSchema,
	listTasksQuerySchema,
	moveTaskSchema,
	setProjectTicketingSchema,
	setStageStatusSchema,
	stageSchema,
	updateEpicSchema,
	updateProjectSchema,
	updateSpecSchema,
	updateTicketingConnectionSchema,
	updateTaskSchema,
	workStatusSchema
} from '#lib/shared/domain/schemas.ts';
import { SYNC_JOB_STATUSES } from '#lib/shared/domain/constants.ts';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../modules/activity/repository.ts';
import type { Page } from '#lib/shared/domain/types.ts';
import { defineOperation, type Operation } from './operation.ts';

const ref = (what: string) => z.string().min(1).describe(`${what} id or key`);
const project = ref('Project (e.g. PMA)');
const epic = ref('Epic (e.g. PMA-E1)');
const task = ref('Task (e.g. PMA-12)');
const spec = z.string().min(1).describe('Spec id');
const limit = z.coerce.number().int().min(1).max(500).optional();
const pageLimit = z.coerce
	.number()
	.int()
	.min(1)
	.max(100)
	.optional()
	.describe('Entries per page (default 10, max 100)');
const offset = z.coerce.number().int().min(0).optional().describe('Entries to skip (default 0)');
const ACTIVITY_PAGING =
	'Paginated, newest first. Returns at most `limit` entries (default 10, max 100); use `offset`/`nextOffset` and `hasMore` to fetch older entries.';

const pagedResult = <T>(page: Page<T>, paging: { limit?: number; offset?: number }) => {
	const limit = Math.min(paging.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
	const offset = paging.offset ?? 0;
	const end = offset + page.items.length;
	const hasMore = end < page.total;
	return { ...page, limit, offset, hasMore, nextOffset: hasMore ? end : null };
};

const BRIEF_GUIDANCE = `The brief is for humans who are not engineers (product managers, designers, stakeholders): describe outcomes and impact, not code. Keep each list item to one plain sentence. Never invent requirements the spec does not state; leave a list empty when the spec is silent. effort is a T-shirt size (S, M, L or XL); readingMinutes is about the spec's word count divided by 200.`;
const BRIEF_REQUIRED = `brief is required when an agent creates or changes a spec's content over MCP. Write it for non-engineers: summary, whyItMatters, whatChanges, acceptance, risks, openQuestions, glossary, effort (S, M, L, XL) and readingMinutes. Describe outcomes, not code; one plain sentence per item; never invent requirements; leave a list empty when the spec is silent.`;
const briefCheck = (input: { brief?: unknown }) => (input.brief ? null : BRIEF_REQUIRED);

const connection = z.string().min(1).describe('Ticketing connection id');
const pick = <T extends Record<string, unknown>, K extends keyof T>(input: T, ...keys: K[]) =>
	Object.fromEntries(Object.entries(input).filter(([k]) => !keys.includes(k as K))) as Omit<T, K>;

export const operations: Operation[] = [
	defineOperation({
		name: 'find_tickets',
		method: 'GET',
		path: '/tickets/search',
		tag: 'Search',
		summary: 'Find tasks, epics and projects by key, linked ticket number or title',
		description:
			'The query is matched case-insensitively, in this order: a project key (SHOP), an epic key (SHOP-E3), a task key (SHOP-15), the key of a linked external ticket (e.g. SOFT1-693 or #123), then task titles and key prefixes. Exact key matches come first. Each hit carries the dashboard path.',
		input: z.object({
			query: z.string().trim().min(1).max(100).describe('Key, linked ticket number or title text'),
			limit: z.coerce.number().int().min(1).max(20).default(8).describe('Max hits (default 8)')
		}),
		run: (app, { query, limit }) => app.search.find(query, limit)
	}),

	// Projects
	defineOperation({
		name: 'list_projects',
		method: 'GET',
		path: '/projects',
		tag: 'Projects',
		summary: 'List projects with their overall progress',
		input: z.object({}),
		run: (app) => app.projects.list()
	}),
	defineOperation({
		name: 'create_project',
		method: 'POST',
		path: '/projects',
		tag: 'Projects',
		summary: 'Create a project',
		description: 'The key prefixes every epic (KEY-E1) and task (KEY-12) of the project.',
		input: createProjectSchema,
		successStatus: 201,
		run: (app, input, { actor }) => app.projects.create(input, actor)
	}),
	defineOperation({
		name: 'get_project',
		method: 'GET',
		path: '/projects/{project}',
		tag: 'Projects',
		summary: 'Get a project and its epics',
		input: z.object({ project }),
		run: (app, { project }) => ({ ...app.projects.get(project), epics: app.epics.list(project) })
	}),
	defineOperation({
		name: 'update_project',
		method: 'PATCH',
		path: '/projects/{project}',
		tag: 'Projects',
		summary: 'Rename a project or change its description',
		input: updateProjectSchema.extend({ project }),
		run: (app, input, { actor }) =>
			app.projects.update(input.project, pick(input, 'project'), actor)
	}),
	defineOperation({
		name: 'delete_project',
		method: 'DELETE',
		path: '/projects/{project}',
		tag: 'Projects',
		summary: 'Delete a project and everything in it',
		input: z.object({ project }),
		run: (app, { project }) => {
			app.projects.delete(project);
			return { deleted: true };
		}
	}),
	defineOperation({
		name: 'get_project_activity',
		method: 'GET',
		path: '/projects/{project}/activity',
		tag: 'Activity',
		summary: 'Recent activity in a project',
		description: ACTIVITY_PAGING,
		input: z.object({ project, limit: pageLimit, offset }),
		run: (app, { project, limit, offset }) =>
			pagedResult(app.activity.forProject(project, { limit, offset }), { limit, offset })
	}),

	// Epics
	defineOperation({
		name: 'list_epics',
		method: 'GET',
		path: '/projects/{project}/epics',
		tag: 'Epics',
		summary: 'List the epics of a project with progress per stage',
		input: z.object({ project }),
		run: (app, { project }) => app.epics.list(project)
	}),
	defineOperation({
		name: 'create_epic',
		method: 'POST',
		path: '/projects/{project}/epics',
		tag: 'Epics',
		summary: 'Create an epic, optionally with its full plan',
		description: `Pass tasks (each with its specs) and epic specs in one call. Use this to turn an AI-generated plan into a trackable epic. Every spec with content needs a brief over MCP. ${BRIEF_GUIDANCE}`,
		input: createEpicSchema.extend({ project }),
		mcp: {
			check: (input) =>
				[...(input.specs ?? []), ...(input.tasks ?? []).flatMap((t) => t.specs ?? [])].some(
					(spec) => spec.content && !spec.brief
				)
					? BRIEF_REQUIRED
					: null
		},
		successStatus: 201,
		run: (app, input, { actor }) => app.epics.create(input.project, pick(input, 'project'), actor)
	}),
	defineOperation({
		name: 'get_epic',
		method: 'GET',
		path: '/epics/{epic}',
		tag: 'Epics',
		summary: 'Get an epic with its tasks, specs and progress',
		input: z.object({ epic }),
		run: (app, { epic }) => app.epics.detail(epic)
	}),
	defineOperation({
		name: 'update_epic',
		method: 'PATCH',
		path: '/epics/{epic}',
		tag: 'Epics',
		summary: 'Update an epic, including its linked external ticket',
		input: updateEpicSchema.extend({ epic }),
		run: (app, input, { actor }) => app.epics.update(input.epic, pick(input, 'epic'), actor)
	}),
	defineOperation({
		name: 'delete_epic',
		method: 'DELETE',
		path: '/epics/{epic}',
		tag: 'Epics',
		summary: 'Delete an epic with its tasks and specs',
		input: z.object({ epic }),
		run: (app, { epic }, { actor }) => {
			app.epics.delete(epic, actor);
			return { deleted: true };
		}
	}),
	defineOperation({
		name: 'get_epic_activity',
		method: 'GET',
		path: '/epics/{epic}/activity',
		tag: 'Activity',
		summary: 'Recent activity in an epic',
		description: ACTIVITY_PAGING,
		input: z.object({ epic, limit: pageLimit, offset }),
		run: (app, { epic, limit, offset }) =>
			pagedResult(app.activity.forEpic(epic, { limit, offset }), { limit, offset })
	}),

	// Tasks
	defineOperation({
		name: 'list_tasks',
		method: 'GET',
		path: '/epics/{epic}/tasks',
		tag: 'Tasks',
		summary: 'List the tasks of an epic',
		description:
			'Filter with stage + status, e.g. stage=test&status=in_progress, to see one column of the board.',
		input: listTasksQuerySchema.extend({ epic }),
		run: (app, { epic, ...filter }) => app.tasks.list(epic, filter)
	}),
	defineOperation({
		name: 'create_task',
		method: 'POST',
		path: '/epics/{epic}/tasks',
		tag: 'Tasks',
		summary: 'Create a task in an epic',
		input: createTaskSchema.extend({ epic }),
		successStatus: 201,
		run: (app, input, { actor }) => app.tasks.create(input.epic, pick(input, 'epic'), actor)
	}),
	defineOperation({
		name: 'get_task',
		method: 'GET',
		path: '/tasks/{task}',
		tag: 'Tasks',
		summary: 'Get a task with its epic and specs',
		input: z.object({ task }),
		run: (app, { task }) => app.tasks.detail(task)
	}),
	defineOperation({
		name: 'update_task',
		method: 'PATCH',
		path: '/tasks/{task}',
		tag: 'Tasks',
		summary: 'Update a task',
		input: updateTaskSchema.extend({ task }),
		run: (app, input, { actor }) => app.tasks.update(input.task, pick(input, 'task'), actor)
	}),
	defineOperation({
		name: 'set_task_stage_status',
		method: 'PUT',
		path: '/tasks/{task}/stages/{stage}',
		tag: 'Tasks',
		summary: 'Move a task to todo, in_progress or done in one stage (dev, test, deploy)',
		description:
			'This is the main progress signal. It updates the linked tickets when ticket sync is on.',
		input: setStageStatusSchema.extend({ task, stage: stageSchema, status: workStatusSchema }),
		run: (app, { task, ...input }, { actor }) => app.tasks.setStage(task, input, actor)
	}),
	defineOperation({
		name: 'move_task',
		method: 'POST',
		path: '/tasks/{task}/move',
		tag: 'Tasks',
		summary: 'Move a task on the board: change a stage status and/or reorder it',
		description:
			'Send stage + status to change column, and beforeTask (or null for last) to set its place in the order.',
		input: moveTaskSchema.extend({ task }),
		run: (app, { task, ...input }, { actor }) => app.tasks.move(task, input, actor)
	}),
	defineOperation({
		name: 'delete_task',
		method: 'DELETE',
		path: '/tasks/{task}',
		tag: 'Tasks',
		summary: 'Delete a task and its specs',
		input: z.object({ task }),
		run: (app, { task }, { actor }) => {
			app.tasks.delete(task, actor);
			return { deleted: true };
		}
	}),

	// Specs
	defineOperation({
		name: 'list_epic_specs',
		method: 'GET',
		path: '/epics/{epic}/specs',
		tag: 'Specs',
		summary: 'List the specs of an epic (without content)',
		input: z.object({ epic, includeTaskSpecs: z.stringbool().optional() }),
		run: (app, { epic, includeTaskSpecs }) => app.specs.listForEpic(epic, includeTaskSpecs)
	}),
	defineOperation({
		name: 'add_epic_spec',
		method: 'POST',
		path: '/epics/{epic}/specs',
		tag: 'Specs',
		summary: 'Attach a markdown spec to an epic',
		description: BRIEF_GUIDANCE,
		input: createSpecSchema.extend({ epic }),
		mcp: { required: ['brief'], check: briefCheck },
		successStatus: 201,
		run: (app, input, { actor }) => app.specs.createForEpic(input.epic, pick(input, 'epic'), actor)
	}),
	defineOperation({
		name: 'list_task_specs',
		method: 'GET',
		path: '/tasks/{task}/specs',
		tag: 'Specs',
		summary: 'List the specs of a task (without content)',
		input: z.object({ task }),
		run: (app, { task }) => app.specs.listForTask(task)
	}),
	defineOperation({
		name: 'add_task_spec',
		method: 'POST',
		path: '/tasks/{task}/specs',
		tag: 'Specs',
		summary: 'Attach a markdown spec to a task',
		description: BRIEF_GUIDANCE,
		input: createSpecSchema.extend({ task }),
		mcp: { required: ['brief'], check: briefCheck },
		successStatus: 201,
		run: (app, input, { actor }) => app.specs.createForTask(input.task, pick(input, 'task'), actor)
	}),
	defineOperation({
		name: 'get_spec',
		method: 'GET',
		path: '/specs/{spec}',
		tag: 'Specs',
		summary: 'Get a spec with its markdown content and human brief',
		input: z.object({ spec }),
		run: (app, { spec }) => app.specs.get(spec)
	}),
	defineOperation({
		name: 'update_spec',
		method: 'PATCH',
		path: '/specs/{spec}',
		tag: 'Specs',
		summary: 'Edit a spec. Changing the content clears its human brief unless you send a new one.',
		description: `Over MCP, brief is required whenever content is sent, so the human brief always matches the content. Title, kind and position edits do not need it. ${BRIEF_GUIDANCE}`,
		input: updateSpecSchema.extend({ spec }),
		mcp: { check: (input) => (input.content !== undefined ? briefCheck(input) : null) },
		run: (app, input, { actor }) => app.specs.update(input.spec, pick(input, 'spec'), actor)
	}),
	defineOperation({
		name: 'delete_spec',
		method: 'DELETE',
		path: '/specs/{spec}',
		tag: 'Specs',
		summary: 'Delete a spec',
		input: z.object({ spec }),
		run: (app, { spec }, { actor }) => {
			app.specs.delete(spec, actor);
			return { deleted: true };
		}
	}),
	defineOperation({
		name: 'set_spec_brief',
		method: 'PUT',
		path: '/specs/{spec}/brief',
		tag: 'Specs',
		summary: 'Write or replace the human brief of a spec, leaving its content untouched',
		description: BRIEF_GUIDANCE,
		input: setSpecBriefSchema.extend({ spec }),
		run: (app, input, { actor }) => app.specs.setBrief(input.spec, pick(input, 'spec'), actor)
	}),
	defineOperation({
		name: 'translate_spec',
		method: 'POST',
		path: '/specs/{spec}/brief',
		tag: 'Specs',
		summary: 'Translate a spec into a plain-language brief for humans',
		description:
			'Uses Claude when ANTHROPIC_API_KEY is set, otherwise an offline rule-based translator.',
		input: z.object({
			spec,
			engine: z.string().optional().describe('heuristic, or the Claude engine id')
		}),
		run: (app, { spec, engine }, { actor }) => app.specs.translate(spec, actor, engine)
	}),

	// Ticketing
	defineOperation({
		name: 'list_ticket_providers',
		method: 'GET',
		path: '/ticketing/providers',
		tag: 'Ticketing',
		summary: 'List the external ticketing systems this server can update',
		input: z.object({}),
		run: (app) => app.ticketing.providers()
	}),
	defineOperation({
		name: 'list_ticketing_connections',
		method: 'GET',
		path: '/ticketing/connections',
		tag: 'Ticketing',
		summary: 'List ticketing connections and the projects using each',
		description:
			'API keys are never returned: hasSecret tells whether one is stored, secretSource whether it comes from storage, the server environment or is missing.',
		input: z.object({}),
		run: (app) => app.connections.list()
	}),
	defineOperation({
		name: 'get_ticketing_connection',
		method: 'GET',
		path: '/ticketing/connections/{connection}',
		tag: 'Ticketing',
		summary: 'Get a ticketing connection',
		input: z.object({ connection }),
		run: (app, { connection }) => app.connections.get(connection)
	}),
	defineOperation({
		name: 'create_ticketing_connection',
		method: 'POST',
		path: '/ticketing/connections',
		tag: 'Ticketing',
		summary: 'Create a ticketing connection',
		description:
			'Holds the account-level settings and the API key of one external system. Projects select a connection. The secret and any custom headers (for example Cloudflare Access service token headers) are encrypted with BRIEFLINE_SECRET_KEY and write-only.',
		input: createTicketingConnectionSchema,
		successStatus: 201,
		run: (app, input) => app.connections.create(input)
	}),
	defineOperation({
		name: 'update_ticketing_connection',
		method: 'PATCH',
		path: '/ticketing/connections/{connection}',
		tag: 'Ticketing',
		summary: 'Update a ticketing connection',
		description:
			'Omit secret to keep the stored one. Send clearSecret: true to remove it, after which the provider environment variable is used if set. headers replaces the whole custom header list; an existing header sent without a value keeps its stored value.',
		input: updateTicketingConnectionSchema.extend({ connection }),
		run: (app, input) => app.connections.update(input.connection, pick(input, 'connection'))
	}),
	defineOperation({
		name: 'delete_ticketing_connection',
		method: 'DELETE',
		path: '/ticketing/connections/{connection}',
		tag: 'Ticketing',
		summary: 'Delete a ticketing connection',
		description: 'Refused while a project uses the connection.',
		input: z.object({ connection }),
		run: (app, { connection }) => {
			app.connections.delete(connection);
			return { deleted: true };
		}
	}),
	defineOperation({
		name: 'test_ticketing_connection',
		method: 'POST',
		path: '/ticketing/connections/{connection}/test',
		tag: 'Ticketing',
		summary: 'Check that the connection can authenticate',
		description: 'Returns { ok, message }. A failing check is a result, not an error.',
		input: z.object({ connection }),
		readOnly: true,
		run: (app, { connection }) => app.connections.test(connection)
	}),
	defineOperation({
		name: 'list_ticketing_states',
		method: 'POST',
		path: '/projects/{project}/ticketing/states',
		tag: 'Ticketing',
		summary: 'List the states of the external project that statuses can be mapped to',
		description:
			"Uses the project's connection and target. Pass connectionId and target to preview a choice that is not saved yet. A POST only because of the body; it changes nothing.",
		input: z.object({
			project,
			connectionId: connection.optional(),
			target: setProjectTicketingSchema.shape.target
		}),
		readOnly: true,
		run: (app, { project, connectionId, target }) =>
			app.connections.listStates(project, { connectionId, target })
	}),
	defineOperation({
		name: 'list_ticketing_projects',
		method: 'GET',
		path: '/ticketing/connections/{connection}/projects',
		tag: 'Ticketing',
		summary: 'List the projects of the external system behind a connection',
		description:
			'Returns { id, name, identifier } for providers that support it (Plane); the id is the value for the project target field. Other providers return an empty list.',
		input: z.object({ connection }),
		readOnly: true,
		run: (app, { connection }) => app.connections.listProjects(connection)
	}),
	defineOperation({
		name: 'set_project_ticketing',
		method: 'PUT',
		path: '/projects/{project}/ticketing',
		tag: 'Ticketing',
		summary: 'Choose the project ticketing connection, target and status mapping',
		description:
			'connectionId null disconnects the project. target holds the project-level provider fields. statusMapping maps not_started, dev, test, deploy and done to { id, name } states from list_ticketing_states; unmapped keys use the provider default.',
		input: setProjectTicketingSchema.extend({ project }),
		run: (app, input, { actor }) =>
			app.connections.setProjectTicketing(input.project, pick(input, 'project'), actor)
	}),
	defineOperation({
		name: 'sync_epic_ticket',
		method: 'POST',
		path: '/epics/{epic}/sync',
		tag: 'Ticketing',
		summary: 'Push the epic status to its linked external ticket now',
		input: z.object({ epic }),
		run: (app, { epic }, { actor }) => app.ticketing.syncEpic(epic, actor)
	}),
	defineOperation({
		name: 'list_sync_jobs',
		method: 'GET',
		path: '/projects/{project}/sync-jobs',
		tag: 'Ticketing',
		summary: 'List ticket sync attempts with their result',
		input: z.object({
			project,
			epic: z.string().optional(),
			status: z.enum(SYNC_JOB_STATUSES).optional(),
			limit
		}),
		run: (app, { project, epic, status, limit }) =>
			app.ticketing.jobs({
				projectId: app.projects.get(project).id,
				epicId: epic ? app.epics.get(epic).id : undefined,
				status,
				limit
			})
	}),
	defineOperation({
		name: 'retry_sync_job',
		method: 'POST',
		path: '/sync-jobs/{job}/retry',
		tag: 'Ticketing',
		summary: 'Retry a failed ticket sync',
		input: z.object({ job: z.string().min(1) }),
		run: (app, { job }) => app.ticketing.retry(job)
	})
];

export const operationsByName = new Map(operations.map((op) => [op.name, op]));
