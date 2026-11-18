import { z } from 'zod';
import {
	addEpicQuestionsSchema,
	createEpicSchema,
	createProjectSchema,
	createTicketingConnectionSchema,
	createSpecSchema,
	cancelTaskSchema,
	createTaskSchema,
	moveEpicSchema,
	moveProjectSchema,
	moveTaskSchema,
	questionStatusSchema,
	replyToQuestionSchema,
	updateQuestionSchema,
	setProjectTicketingSchema,
	setStageStatusSchema,
	stageSchema,
	taskCommentSchema,
	uploadAttachmentSchema,
	attachmentTargetSchema,
	updateEpicSchema,
	updateProjectSchema,
	updateSpecSchema,
	updateTicketingConnectionSchema,
	updateTaskSchema,
	userProfileSchema,
	workStatusSchema
} from '#lib/shared/domain/schemas.ts';
import { SYNC_JOB_STATUSES } from '#lib/shared/domain/constants.ts';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../modules/activity/repository.ts';
import { summarySchema } from '../modules/sessions/service.ts';
import type { Page } from '#lib/shared/domain/types.ts';
import { InvalidInputError } from '../core/errors.ts';
import { HOW_TO_TOPICS, howTo } from '../modules/guide/how-to.ts';
import { defineOperation, type Operation } from './operation.ts';

const ref = (what: string) => z.string().min(1).describe(`${what} id or key`);
const project = ref('Project (e.g. PMA)');
const epic = ref('Epic (e.g. PMA-E1)');
const task = ref('Task (e.g. PMA-12)');
const question = z.string().min(1).describe('Question id');
const comment = z.string().min(1).describe('Comment id');
const spec = z.string().min(1).describe('Spec id');
const limit = z.coerce.number().int().min(1).max(500).optional();
const pagedResult = <T>(page: Page<T>, paging: { limit?: number; offset?: number }) =>
	listedPage(page, {
		...paging,
		limit: Math.min(paging.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
	});

const listedPage = <T>(page: Page<T>, paging: { limit: number; offset?: number }) => {
	const limit = paging.limit;
	const offset = paging.offset ?? 0;
	const end = offset + page.items.length;
	const hasMore = end < page.total;
	return { ...page, limit, offset, hasMore, nextOffset: hasMore ? end : null };
};

const decodeBase64 = (data: string) => {
	// Padding-free input is accepted; anything else outside the alphabet is not an image anyway.
	if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(data)) throw new InvalidInputError('data is not base64');
	return Buffer.from(data, 'base64');
};

const BRIEF_GUIDANCE = `The brief is for humans who are not engineers (product managers, designers, stakeholders): describe outcomes and impact, not code. Keep each list item to one plain sentence. Never invent requirements the spec does not state; leave a list empty when the spec is silent. effort is a T-shirt size (S, M, L or XL); readingMinutes is about the spec's word count divided by 200.`;
const BRIEF_REQUIRED = `brief is required when an agent creates or changes a spec's content over MCP. Write it for non-engineers: summary, whyItMatters, whatChanges, acceptance, risks, openQuestions, glossary, effort (S, M, L, XL) and readingMinutes. Describe outcomes, not code; one plain sentence per item; never invent requirements; leave a list empty when the spec is silent.`;
const briefCheck = (input: { brief?: unknown }) => (input.brief ? null : BRIEF_REQUIRED);

const connection = z.string().min(1).describe('Ticketing connection id');
const pick = <T extends Record<string, unknown>, K extends keyof T>(input: T, ...keys: K[]) =>
	Object.fromEntries(Object.entries(input).filter(([k]) => !keys.includes(k as K))) as Omit<T, K>;

const specOwner = (input: { project?: string; epic?: string; task?: string }) => {
	const owners = (['project', 'epic', 'task'] as const).filter((type) => input[type]);
	if (owners.length !== 1) throw new InvalidInputError('Send exactly one of project, epic or task');
	return { type: owners[0], id: input[owners[0]]! };
};

export const operations: Operation[] = [
	defineOperation({
		name: 'how_to',
		method: 'GET',
		path: '/how-to',
		tag: 'Guide',
		summary: 'Explains Briefline concepts; start here',
		input: z.object({ topic: z.enum(HOW_TO_TOPICS).optional() }),
		run: (_app, { topic }) => howTo(topic)
	}),
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
		mcp: { hidden: true },
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
		summary: 'Get a project with its epics and specs',
		description:
			'ready: true limits epics to the ones you can start: no open questions, approved specs (or none), not done, in the order the user set. Start with the first one.',
		input: z.object({
			project,
			ready: z
				.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
				.optional()
				.describe('Only list the epics ready to work on'),
			archived: z.boolean().optional().describe('List archived epics instead of active ones')
		}),
		run: (app, { project, ready, archived }) => ({
			...app.projects.get(project),
			epics: ready
				? app.epics.workToDo(project)
				: app.epics.list(project, { archived: archived ?? false }),
			specs: app.specs.listForProject(project)
		})
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
		name: 'move_project',
		mcp: { hidden: true },
		method: 'POST',
		path: '/projects/{project}/move',
		tag: 'Projects',
		summary: 'Reorder projects: place a project before another one, or last',
		description:
			'Send beforeProject (id or key) to place the project just before it; omit it or send null for last. Returns the moved project.',
		input: moveProjectSchema.extend({ project }),
		run: (app, { project, ...input }) => app.projects.move(project, input)
	}),
	defineOperation({
		name: 'delete_project',
		mcp: { hidden: true },
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
		name: 'list_agents',
		method: 'GET',
		path: '/agents',
		tag: 'Activity',
		summary: 'Agents that have used the API or MCP, with when they were last seen',
		description:
			'Any request with an X-Actor header counts as seen. `status` is online (seen in the last 5 minutes), away (5 to 20 minutes) or offline. Agents that called register_agent also carry `repo`, `name` and `role`.',
		input: z.object({}),
		run: (app) => {
			const registrations = app.sessions.registrations();
			return app.presence
				.withStatus()
				.map((agent) => ({ ...agent, ...registrations.get(agent.actor) }));
		}
	}),

	// Inbox
	defineOperation({
		name: 'get_inbox',
		method: 'GET',
		path: '/inbox',
		tag: 'Inbox',
		summary: 'Tasks and epics that others changed since you last acknowledged them',
		description:
			"Tasks that people or other agents created, commented or moved, and epics where they added or answered a thread, that you have not acknowledged up to their latest change, oldest first. Your own changes never show. Each item has its `changes` (the others' activity entries after your last acknowledgement), `seq` (pass it to ack_inbox), `ackedBy` (the other agents that acknowledged it and whether they are up to date) and, for tasks, the current `assignee`. Read `changes`, act on them, then call ack_inbox.",
		input: z.object({ project: project.optional() }),
		run: (app, { project }, { actor }) => app.inbox.list(actor, project)
	}),
	defineOperation({
		name: 'ack_inbox',
		method: 'POST',
		path: '/inbox/ack',
		tag: 'Inbox',
		summary: 'Acknowledge inbox items once handled',
		description:
			'Marks items handled for you only; other agents still see them until they acknowledge too. Pass `{ item, seq }` with the `seq` from get_inbox so a change that arrived since is not acknowledged unseen; a plain key acknowledges up to the latest change. Safe to repeat. An unknown key fails and acknowledges nothing. A later change by someone else shows the item again with only the new changes. Returns `acknowledged`: the keys whose acknowledgement advanced.',
		input: z.object({
			items: z
				.array(
					z.union([
						z.string().min(1),
						z.object({ item: z.string().min(1), seq: z.number().int().min(0) })
					])
				)
				.min(1)
				.describe('Task or epic keys (e.g. PMA-12 or PMA-E1), or { item, seq } objects')
		}),
		run: (app, { items }, { actor }) => app.inbox.ack(actor, items)
	}),
	defineOperation({
		name: 'mark_inbox_seen',
		method: 'POST',
		path: '/inbox/seen',
		tag: 'Inbox',
		summary: 'Mark inbox items seen by the person',
		description:
			'Clears items from the person inbox up to their latest change; agents still see them until they acknowledge. Returns `acknowledged`: the keys whose acknowledgement advanced.',
		input: z.object({
			items: z.array(z.string().min(1)).min(1).describe('Task or epic keys (e.g. PMA-12 or PMA-E1)')
		}),
		mcp: { excluded: true },
		run: (app, { items }) => app.inbox.markSeen(items)
	}),

	// Sessions
	defineOperation({
		name: 'register_agent',
		method: 'POST',
		path: '/agents/register',
		tag: 'Sessions',
		summary: 'Name this MCP session as an agent working in a GitHub project',
		description:
			'Call first in a session. `repo` is the GitHub project, owner/repo from `git remote get-url origin` (the folder name when there is no remote); `name` is a short role name such as backend-agent. Your agent name becomes `<repo without owner>:<name>` (e.g. briefline:backend-agent) for every later call in the session. A name is held by one online session at a time (409 otherwise); a name whose session is away or offline can be claimed, which ends that session. MCP sessions only.',
		input: z.object({
			repo: z
				.string()
				.min(1)
				.max(100)
				.regex(/^[\w.-]+(\/[\w.-]+)?$/, 'Use owner/repo')
				.describe('GitHub project, owner/repo'),
			name: z
				.string()
				.regex(/^[\w.-]{1,40}$/, 'Use letters, digits, dot, dash or underscore (max 40)')
				.describe('Short role name, e.g. backend-agent'),
			role: z.string().max(200).optional().describe('What this agent does')
		}),
		mcp: { required: ['repo', 'name'] },
		run: (app, input) => app.sessions.register(input)
	}),
	defineOperation({
		name: 'get_last_session',
		method: 'GET',
		path: '/sessions/last',
		tag: 'Sessions',
		summary: 'The previous agent session, for context on work already done',
		description:
			'Read the previous agent session: its summary, what it changed (recap counts) and its latest activity. Call at the start of a session for context on work already done; pass `project` to scope it. Your own current session is skipped, as are sessions without activity. Returns `{ session: null, message }` when there is none.',
		input: z.object({
			project: ref('Only sessions that touched this project').optional(),
			actor: z.string().min(1).optional().describe('Only sessions of this actor (default: any)'),
			activityLimit: z.coerce
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.describe('Activity entries to include, newest first (default 20, max 100)')
		}),
		run: (app, { project, actor, activityLimit }) => {
			const limit = activityLimit ?? 20;
			const detail = app.sessions.last({ project, actor, limit });
			if (!detail) return { session: null, message: 'No previous session' };
			return {
				session: detail.session,
				activity: pagedResult(detail.activity, { limit, offset: 0 })
			};
		}
	}),
	defineOperation({
		name: 'set_session_summary',
		method: 'PUT',
		path: '/sessions/summary',
		tag: 'Sessions',
		summary: 'Write the recap of a session',
		description:
			'Write a short plain-language recap of what this session did, adapted to the user profile (role and coding level). Call it when you finish a chunk of work; each call overwrites the previous summary. Markdown is allowed. Without `session` it applies to your current MCP session.',
		input: z.object({
			summary: summarySchema.describe('Markdown recap; an empty string clears it'),
			session: z.string().min(1).optional().describe('Session id (default: your current session)')
		}),
		mcp: { required: ['summary'] },
		run: (app, { summary, session }) => app.sessions.setSummary(session, summary)
	}),

	// Epics
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
		summary: 'Get an epic with its tasks, specs, questions and progress',
		description:
			'questions lists every question thread of the epic with its replies in messages; openQuestions counts the open ones. Tasks cannot be started while any is open or specsApprovedAt is null. specsApprovedBy identifies who approved. Approval is a one-time gate: later spec changes keep the epic approved.',
		input: z.object({ epic }),
		run: (app, { epic }) => app.epics.detail(epic)
	}),
	defineOperation({
		name: 'update_epic',
		method: 'PATCH',
		path: '/epics/{epic}',
		tag: 'Epics',
		summary: 'Update an epic, including its linked external ticket',
		description:
			'archived: true hides the epic from the project board and work lists, archived: false restores it (cancelled tasks stay cancelled). archived: true returns 409 epic_has_open_tasks while unfinished tasks remain; force: true cancels them first (reason "Epic archived").',
		input: updateEpicSchema.extend({ epic }),
		run: (app, input, { actor }) => app.epics.update(input.epic, pick(input, 'epic'), actor)
	}),
	defineOperation({
		name: 'archive_done_epics',
		method: 'POST',
		path: '/projects/{project}/epics/archive-done',
		tag: 'Epics',
		summary: 'Archive every completed epic of a project',
		input: z.object({ project }),
		run: (app, { project }, { actor }) => ({ archived: app.epics.archiveDone(project, actor) })
	}),
	defineOperation({
		name: 'approve_epic_specs',
		method: 'POST',
		path: '/epics/{epic}/specs/approve',
		tag: 'Epics',
		summary: 'Approve the specs of an epic',
		description:
			'Record approval after a person reviews the epic and task specs. When the epic has specs, tasks cannot start until specsApprovedAt is set (409 specs_not_approved); creating tasks is not blocked. Open questions still block starts. Approval is a one-time gate: later spec changes keep the epic approved.',
		input: z.object({ epic }),
		run: (app, { epic }, { actor }) => app.epics.approveSpecs(epic, actor)
	}),

	defineOperation({
		name: 'move_epic',
		mcp: { excluded: true },
		method: 'POST',
		path: '/epics/{epic}/move',
		tag: 'Epics',
		summary: 'Reorder epics: place an epic before another one of the same project, or last',
		description:
			'Send beforeEpic (id or key) to place the epic just before it; omit it or send null for last. Returns the moved epic.',
		input: moveEpicSchema.extend({ epic }),
		run: (app, { epic, ...input }) => app.epics.move(epic, input)
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

	// Tasks
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
		summary: 'Update a task, or cancel and restore it',
		description:
			'cancelled: true drops a task that will not be done: it stays on the board but leaves epic and project progress, and its stage statuses are kept. cancelled: false restores it. A restore is applied before the other changes; stage changes on a cancelled task are refused.',
		input: updateTaskSchema.extend({
			task,
			cancelled: z.boolean().optional(),
			cancelReason: cancelTaskSchema.shape.reason.describe(
				'Why the task was dropped; recorded in the activity log and ticket comment. Only with cancelled: true'
			)
		}),
		run: (app, { task, cancelled, cancelReason, ...fields }, { actor }) => {
			if (cancelReason !== undefined && cancelled !== true)
				throw new InvalidInputError('cancelReason needs cancelled: true');
			if (cancelled === undefined) return app.tasks.update(task, fields, actor);
			if (cancelled === false) app.tasks.restore(task, actor);
			else if (fields.stages) {
				const current = app.tasks.get(task);
				throw new InvalidInputError(`Task ${current.key} is cancelled; restore it first`);
			}
			if (Object.keys(fields).length) app.tasks.update(task, fields, actor);
			return cancelled
				? app.tasks.cancel(task, { reason: cancelReason }, actor)
				: app.tasks.get(task);
		}
	}),
	defineOperation({
		name: 'set_task_stage_status',
		method: 'PUT',
		path: '/tasks/{task}/stages/{stage}',
		tag: 'Tasks',
		summary: 'Move a task to todo, in_progress or done in one stage (dev, test, deploy)',
		description:
			'This is the main progress signal. It updates the linked tickets when ticket sync is on. When an agent sets in_progress on a task without an assignee, it becomes the assignee (a soft claim). If another agent already holds the task the call still succeeds and the response carries `claimedBy`: back off or coordinate on the task comments.',
		input: setStageStatusSchema.extend({ task, stage: stageSchema, status: workStatusSchema }),
		run: (app, { task, ...input }, { actor }) => {
			const updated = app.tasks.setStage(task, input, actor);
			return input.status === 'in_progress' ? app.tasks.claim(updated, actor) : updated;
		}
	}),
	defineOperation({
		name: 'move_task',
		mcp: { excluded: true },
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

	// Task comments
	defineOperation({
		name: 'add_task_comment',
		method: 'POST',
		path: '/tasks/{task}/comments',
		tag: 'Comments',
		summary: 'Comment on a task',
		description:
			'Adds a markdown comment to the task. Agents use it to record findings, decisions or blockers while they work; people comment too, so read and act on their comments (get_task).',
		input: taskCommentSchema.extend({ task }),
		successStatus: 201,
		run: (app, input, { actor }) => app.comments.add(input.task, pick(input, 'task'), actor)
	}),
	defineOperation({
		name: 'update_task_comment',
		method: 'PATCH',
		path: '/task-comments/{comment}',
		tag: 'Comments',
		summary: 'Edit a task comment',
		description:
			"Agents can only edit their own comments, never a person's (403 forbidden otherwise).",
		input: taskCommentSchema.extend({ comment }),
		run: (app, input, { actor }) =>
			app.comments.update(input.comment, pick(input, 'comment'), actor)
	}),
	defineOperation({
		name: 'delete_task_comment',
		method: 'DELETE',
		path: '/task-comments/{comment}',
		tag: 'Comments',
		summary: 'Delete a task comment',
		description:
			"Agents can only delete their own comments, never a person's (403 forbidden otherwise).",
		input: z.object({ comment }),
		run: (app, { comment }, { actor }) => {
			app.comments.delete(comment, actor);
			return { deleted: true };
		}
	}),

	// Attachments
	defineOperation({
		name: 'upload_attachment',
		method: 'POST',
		path: '/attachments',
		tag: 'Attachments',
		summary: 'Upload an image and get markdown to embed it',
		description:
			'Upload an image (e.g. a screenshot) and paste the returned `markdown` into a spec, task description or comment. PNG, JPEG, GIF or WebP up to 10 MB, sent base64 encoded in `data`; the type is detected from the bytes. The image is attached to the target and deleted with it.',
		input: uploadAttachmentSchema,
		successStatus: 201,
		run: (app, { target, filename, data }, { actor }) =>
			app.attachments.upload({ target, filename, data: decodeBase64(data) }, actor)
	}),
	defineOperation({
		name: 'list_attachments',
		mcp: { excluded: true },
		method: 'GET',
		path: '/attachments',
		tag: 'Attachments',
		summary: 'List the images uploaded to a project, task or spec',
		description:
			'Pass type (project, task or spec) and id as query parameters over REST, or target over MCP. A project lists only its own images, not those of its tasks and specs.',
		input: z.object({
			target: attachmentTargetSchema.optional(),
			type: attachmentTargetSchema.shape.type.optional(),
			id: attachmentTargetSchema.shape.id.optional()
		}),
		run: (app, { target, type, id }) => {
			const resolved = target ?? (type && id ? { type, id } : null);
			if (!resolved) throw new InvalidInputError('Give a target (type and id)');
			return app.attachments.list(resolved).map((a) => ({
				id: a.id,
				url: `/attachments/${a.id}`,
				markdown: `![${a.filename.replace(/[[\]]/g, '')}](/attachments/${a.id})`,
				filename: a.filename,
				mime: a.mime,
				size: a.size,
				uploadedBy: a.uploadedBy,
				createdAt: a.createdAt
			}));
		}
	}),
	defineOperation({
		name: 'delete_attachment',
		mcp: { excluded: true },
		method: 'DELETE',
		path: '/attachments/{attachment}',
		tag: 'Attachments',
		summary: 'Delete an uploaded image',
		description: 'Markdown that still points at the image will show a broken image.',
		input: z.object({ attachment: z.string().min(1).describe('Attachment id') }),
		run: (app, { attachment }, { actor }) => {
			app.attachments.delete(attachment, actor);
			return { deleted: true };
		}
	}),

	// Questions
	defineOperation({
		name: 'add_epic_questions',
		method: 'POST',
		path: '/epics/{epic}/questions',
		tag: 'Questions',
		summary: 'Ask one or more questions on an epic',
		description:
			'Opens question threads. Ask anything unclear before starting the epic; people open threads here too. While a question is open, no task of the epic can be started (409 open_questions). A person answers or ignores them in the dashboard; add details later with reply_to_question.',
		input: addEpicQuestionsSchema.extend({ epic }),
		successStatus: 201,
		run: (app, input, { actor }) => app.questions.add(input.epic, pick(input, 'epic'), actor)
	}),
	defineOperation({
		name: 'reply_to_question',
		method: 'POST',
		path: '/questions/{question}/replies',
		tag: 'Questions',
		summary: 'Reply in a question thread',
		description:
			'Adds a markdown message to the thread. Agents use it to add details or findings; it does not answer, ignore or reopen the question. Allowed in any status.',
		input: replyToQuestionSchema.extend({ question }),
		successStatus: 201,
		run: (app, input, { actor }) =>
			app.questions.reply(input.question, pick(input, 'question'), actor)
	}),
	defineOperation({
		name: 'update_question',
		method: 'PATCH',
		path: '/questions/{question}',
		tag: 'Questions',
		summary: 'Edit a question, and answer, ignore or reopen it',
		description:
			'status answered resolves the thread with a final answer (send answer; answer alone implies answered), ignored means the agent uses its own judgement, open reopens it and clears the answer. Edits to the text, context or options and a status change can be sent together. Use reply_to_question to add details without resolving the thread.',
		input: updateQuestionSchema.extend({
			question,
			status: questionStatusSchema.optional(),
			answer: z.string().optional().describe('Final answer, with status answered')
		}),
		run: (app, { question, status, answer, ...fields }, { actor }) => {
			const target = status ?? (answer === undefined ? undefined : 'answered');
			if (target === 'answered' && answer === undefined)
				throw new InvalidInputError('Send answer with status answered');
			if (target !== undefined && target !== 'answered' && answer !== undefined)
				throw new InvalidInputError('answer only goes with status answered');
			let result =
				target === undefined || Object.keys(fields).length
					? app.questions.update(question, fields, actor)
					: undefined;
			if (target === 'answered')
				result = app.questions.answer(question, { answer: answer! }, actor);
			else if (target === 'ignored') result = app.questions.ignore(question, actor);
			else if (target === 'open') result = app.questions.reopen(question, actor);
			return result;
		}
	}),
	defineOperation({
		name: 'delete_question',
		method: 'DELETE',
		path: '/questions/{question}',
		tag: 'Questions',
		summary: 'Delete a question',
		input: z.object({ question }),
		run: (app, { question }, { actor }) => {
			app.questions.delete(question, actor);
			return { deleted: true };
		}
	}),

	// Specs
	defineOperation({
		name: 'add_spec',
		method: 'POST',
		path: '/specs',
		tag: 'Specs',
		summary: 'Attach a markdown spec to a project, epic or task',
		description: `Send exactly one of project, epic or task. ${BRIEF_GUIDANCE}`,
		input: createSpecSchema.extend({
			project: project.optional(),
			epic: epic.optional(),
			task: task.optional()
		}),
		mcp: { required: ['brief'], check: briefCheck },
		successStatus: 201,
		run: (app, input, { actor }) => {
			const owner = specOwner(input);
			const data = pick(input, 'project', 'epic', 'task');
			if (owner.type === 'project') return app.specs.createForProject(owner.id, data, actor);
			if (owner.type === 'epic') return app.specs.createForEpic(owner.id, data, actor);
			return app.specs.createForTask(owner.id, data, actor);
		}
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
		name: 'list_spec_versions',
		mcp: { excluded: true },
		method: 'GET',
		path: '/specs/{spec}/versions',
		tag: 'Specs',
		summary: 'List the versions of a spec, newest first, the current one included',
		input: z.object({ spec }),
		run: (app, { spec }) => app.specs.versions(spec)
	}),
	defineOperation({
		name: 'update_spec',
		method: 'PATCH',
		path: '/specs/{spec}',
		tag: 'Specs',
		summary: 'Edit a spec. Changing the content clears its human brief unless you send a new one.',
		description: `Over MCP, brief is required whenever content is sent, so the human brief always matches the content. Title, kind and position edits do not need it. Send brief alone to rewrite the brief and leave the content untouched. ${BRIEF_GUIDANCE}`,
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
		name: 'translate_spec',
		mcp: { excluded: true },
		method: 'POST',
		path: '/specs/{spec}/brief',
		tag: 'Specs',
		summary: 'Translate a spec into a plain-language brief for humans',
		description:
			'Uses Claude when ANTHROPIC_API_KEY is set, otherwise an offline rule-based translator.',
		input: z.object({
			spec,
			engine: z.string().optional().describe('heuristic, or the engine id')
		}),
		run: (app, { spec, engine }, { actor }) => app.specs.translate(spec, actor, engine)
	}),

	// Profile
	defineOperation({
		name: 'get_user_profile',
		mcp: { excluded: true },
		method: 'GET',
		path: '/profile',
		tag: 'Profile',
		summary: 'Who the user is and how to write for them',
		description:
			'Returns the profile (null until the user fills it in) and a short guidance string. Adapt your tone and every spec brief to the role and coding level.',
		input: z.object({}),
		run: (app) => app.profile.view()
	}),
	defineOperation({
		name: 'update_user_profile',
		mcp: { hidden: true },
		method: 'PUT',
		path: '/profile',
		tag: 'Profile',
		summary: 'Set the user profile',
		description:
			'There is one profile per Briefline install. The dashboard asks for it on first launch.',
		input: userProfileSchema,
		run: (app, input) => app.profile.update(input)
	}),

	// Ticketing
	defineOperation({
		name: 'list_ticket_providers',
		mcp: { hidden: true },
		method: 'GET',
		path: '/ticketing/providers',
		tag: 'Ticketing',
		summary: 'List the external ticketing systems this server can update',
		input: z.object({}),
		run: (app) => app.ticketing.providers()
	}),
	defineOperation({
		name: 'list_ticketing_connections',
		mcp: { hidden: true },
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
		mcp: { hidden: true },
		method: 'GET',
		path: '/ticketing/connections/{connection}',
		tag: 'Ticketing',
		summary: 'Get a ticketing connection',
		input: z.object({ connection }),
		run: (app, { connection }) => app.connections.get(connection)
	}),
	defineOperation({
		name: 'create_ticketing_connection',
		mcp: { hidden: true },
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
		mcp: { hidden: true },
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
		mcp: { hidden: true },
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
		mcp: { hidden: true },
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
		mcp: { hidden: true },
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
		mcp: { hidden: true },
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
		mcp: { excluded: true },
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
		name: 'pull_project_tickets',
		mcp: { hidden: true },
		method: 'POST',
		path: '/projects/{project}/pull',
		tag: 'Ticketing',
		summary: 'Pull the linked tickets of a project now',
		description:
			'Starts a pull of status, title, description and new comments from the linked tickets at once, even when autoPull is off, and returns without waiting. The result is { running, lastPulledAt, updated, error }; when a pull already runs, that one continues and its status is returned. Fails with 409 when the project has no connection whose provider supports pulling.',
		input: z.object({ project }),
		run: (app, { project }) => app.ticketPull.pullNow(project)
	}),
	defineOperation({
		name: 'sync_epic_ticket',
		mcp: { excluded: true },
		method: 'POST',
		path: '/epics/{epic}/sync',
		tag: 'Ticketing',
		summary: 'Push the epic status to its linked external ticket now',
		input: z.object({ epic }),
		run: (app, { epic }, { actor }) => app.ticketing.syncEpic(epic, actor)
	}),
	defineOperation({
		name: 'list_sync_jobs',
		mcp: { hidden: true },
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
		mcp: { hidden: true },
		method: 'POST',
		path: '/sync-jobs/{job}/retry',
		tag: 'Ticketing',
		summary: 'Retry a failed ticket sync',
		input: z.object({ job: z.string().min(1) }),
		run: (app, { job }) => app.ticketing.retry(job)
	})
];

export const operationsByName = new Map(operations.map((op) => [op.name, op]));
