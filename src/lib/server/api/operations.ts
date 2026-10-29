import { z } from 'zod';
import {
	createEpicSchema,
	createPhaseSchema,
	createProjectSchema,
	createSpecSchema,
	createTaskSchema,
	listTasksQuerySchema,
	moveTaskSchema,
	setStageStatusSchema,
	stageSchema,
	updateEpicSchema,
	updatePhaseSchema,
	updateProjectSchema,
	updateSpecSchema,
	updateTaskSchema,
	workStatusSchema
} from '#lib/shared/domain/schemas.ts';
import { SYNC_JOB_STATUSES } from '#lib/shared/domain/constants.ts';
import { defineOperation, type Operation } from './operation.ts';

const ref = (what: string) => z.string().min(1).describe(`${what} id or key`);
const project = ref('Project (e.g. PMA)');
const epic = ref('Epic (e.g. PMA-E1)');
const task = ref('Task (e.g. PMA-12)');
const phase = z.string().min(1).describe('Phase id');
const spec = z.string().min(1).describe('Spec id');
const limit = z.coerce.number().int().min(1).max(500).optional();
const pick = <T extends Record<string, unknown>, K extends keyof T>(input: T, ...keys: K[]) =>
	Object.fromEntries(Object.entries(input).filter(([k]) => !keys.includes(k as K))) as Omit<T, K>;

export const operations: Operation[] = [
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
		summary: 'Update a project, including its ticketing integration',
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
		summary: 'Recent activity in a project, newest first',
		input: z.object({ project, limit }),
		run: (app, { project, limit }) => app.activity.forProject(project, limit)
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
		description:
			'Pass phases (the vertical timeline), each with tasks, and specs in one call. Use this to turn an AI-generated plan into a trackable epic.',
		input: createEpicSchema.extend({ project }),
		successStatus: 201,
		run: (app, input, { actor }) => app.epics.create(input.project, pick(input, 'project'), actor)
	}),
	defineOperation({
		name: 'get_epic',
		method: 'GET',
		path: '/epics/{epic}',
		tag: 'Epics',
		summary: 'Get an epic with its timeline phases, tasks, specs and progress',
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
		summary: 'Delete an epic with its phases, tasks and specs',
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
		summary: 'Recent activity in an epic, newest first',
		input: z.object({ epic, limit }),
		run: (app, { epic, limit }) => app.activity.forEpic(epic, limit)
	}),

	// Phases
	defineOperation({
		name: 'create_phase',
		method: 'POST',
		path: '/epics/{epic}/phases',
		tag: 'Phases',
		summary: 'Add a phase to the epic timeline',
		input: createPhaseSchema.extend({ epic }),
		successStatus: 201,
		run: (app, input, { actor }) => app.phases.create(input.epic, pick(input, 'epic'), actor)
	}),
	defineOperation({
		name: 'update_phase',
		method: 'PATCH',
		path: '/phases/{phase}',
		tag: 'Phases',
		summary: 'Rename, reorder, date or set the status of a phase',
		description:
			'The status only applies while the phase has no tasks; otherwise it is derived from them.',
		input: updatePhaseSchema.extend({ phase }),
		run: (app, input, { actor }) => app.phases.update(input.phase, pick(input, 'phase'), actor)
	}),
	defineOperation({
		name: 'delete_phase',
		method: 'DELETE',
		path: '/phases/{phase}',
		tag: 'Phases',
		summary: 'Remove a phase. Its tasks stay in the epic without a phase.',
		input: z.object({ phase }),
		run: (app, { phase }, { actor }) => {
			app.phases.delete(phase, actor);
			return { deleted: true };
		}
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
		summary: 'Get a task with its epic, phase and specs',
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
		input: createSpecSchema.extend({ epic }),
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
		input: createSpecSchema.extend({ task }),
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
		summary: 'Edit a spec. Changing the content clears its human brief.',
		input: updateSpecSchema.extend({ spec }),
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
