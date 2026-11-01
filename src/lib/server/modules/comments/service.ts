import { isHumanActor } from '#lib/shared/domain/actors.ts';
import { taskCommentSchema } from '#lib/shared/domain/schemas.ts';
import type { Task, TaskComment } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { ForbiddenError, NotFoundError } from '../../core/errors.ts';
import { newId, now } from '../../core/ids.ts';
import { requireEpic, requireTask } from '../../core/lookup.ts';

type CommentEvent = 'task.commented' | 'task.comment_updated' | 'task.comment_deleted';

const MAX_STORED = 500;

export class CommentService {
	constructor(private readonly deps: ServiceDeps) {}

	list(taskIdOrKey: string): TaskComment[] {
		const task = requireTask(this.deps.repos, taskIdOrKey);
		return this.deps.repos.comments.listByTask(task.id);
	}

	add(taskIdOrKey: string, input: { body: string }, actor: string): TaskComment {
		const { body } = taskCommentSchema.parse(input);
		const task = requireTask(this.deps.repos, taskIdOrKey);
		const timestamp = now();
		const comment: TaskComment = {
			id: newId(),
			taskId: task.id,
			author: actor,
			authorKind: this.#isHuman(actor) ? 'human' : 'agent',
			body,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		this.deps.repos.comments.insert(comment);
		this.#emit('task.commented', task, comment, actor);
		return comment;
	}

	update(id: string, input: { body: string }, actor: string): TaskComment {
		const { body } = taskCommentSchema.parse(input);
		const { task, comment } = this.#own(id, actor, 'edit');
		const updated: TaskComment = { ...comment, body, updatedAt: now() };
		this.deps.repos.comments.updateBody(id, body, updated.updatedAt);
		this.#emit('task.comment_updated', task, updated, actor);
		return updated;
	}

	delete(id: string, actor: string) {
		const { task, comment } = this.#own(id, actor, 'delete');
		this.deps.repos.comments.delete(id);
		this.#emit('task.comment_deleted', task, comment, actor);
	}

	#isHuman(actor: string) {
		return isHumanActor(actor, this.deps.repos.profile.get()?.name);
	}

	/** The person may change any person's comment; an agent only its own. */
	#own(id: string, actor: string, verb: string): { task: Task; comment: TaskComment } {
		const comment = this.deps.repos.comments.find(id);
		if (!comment) throw new NotFoundError('Comment', id);
		if (this.#isHuman(actor)) {
			if (comment.authorKind !== 'human') {
				throw new ForbiddenError(`Only ${comment.author} can ${verb} this comment`);
			}
		} else if (comment.authorKind !== 'agent' || comment.author !== actor) {
			throw new ForbiddenError(
				comment.authorKind === 'human'
					? `Only the person can ${verb} a person's comment`
					: `Only ${comment.author} can ${verb} this comment`
			);
		}
		return { task: requireTask(this.deps.repos, comment.taskId), comment };
	}

	#emit(type: CommentEvent, task: Task, comment: TaskComment, actor: string) {
		const epic = requireEpic(this.deps.repos, task.epicId);
		this.deps.events.emit({
			type,
			projectId: epic.projectId,
			epicId: epic.id,
			taskId: task.id,
			actor,
			data: {
				key: task.key,
				title: task.title,
				commentId: comment.id,
				body: comment.body.slice(0, MAX_STORED)
			}
		});
	}
}
