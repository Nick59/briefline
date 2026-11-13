import type { InboxItem } from '#lib/shared/domain/types.ts';
import { HUMAN_ACTORS, isHumanActor } from '#lib/shared/domain/actors.ts';
import { transaction } from '../../db/connection.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { NotFoundError } from '../../core/errors.ts';
import { now } from '../../core/ids.ts';
import { requireProject } from '../../core/lookup.ts';
import { MAX_ACTIVITY_LIST_SIZE } from '../activity/repository.ts';
import type { InboxTarget } from './repository.ts';

const TASK_ACTIONS = new Set([
	'task.created',
	'task.updated',
	'task.cancelled',
	'task.restored',
	'task.commented',
	'task.comment_updated',
	'task.comment_deleted',
	'task.stage_changed'
]);

export class InboxService {
	constructor(private readonly deps: ServiceDeps) {
		// Must be created after ActivityService so that activity.head() is this event's entry.
		deps.events.subscribe((event) => {
			const target: InboxTarget | null =
				event.taskId && TASK_ACTIONS.has(event.type)
					? { taskId: event.taskId }
					: event.epicId && event.type.startsWith('question.') && event.type !== 'question.deleted'
						? { epicId: event.epicId }
						: null;
			if (!target || !isHumanActor(event.actor, deps.repos.profile.get()?.name)) return;
			deps.repos.inbox.flag(target, deps.repos.activity.head(), now());
		});
	}

	/** With an agent, the items it has not acknowledged up to their latest change; without, all of them. */
	list(project?: string, agent?: string): InboxItem[] {
		const { repos } = this.deps;
		const name = repos.profile.get()?.name;
		const people = name ? [...HUMAN_ACTORS, name] : [...HUMAN_ACTORS];
		return repos.inbox
			.list(project ? requireProject(repos, project).id : undefined, agent)
			.flatMap((row) => {
				const task = row.taskId ? repos.tasks.find(row.taskId) : undefined;
				const epic = repos.epics.find(row.epicId ?? task?.epicId ?? '');
				const owner = epic && repos.projects.find(epic.projectId);
				if (!epic || !owner) return [];
				const changes = repos.activity
					.list({
						...(task ? { taskId: task.id } : { epicId: epic.id, actionPrefix: 'question.' }),
						sinceSeq: row.ackedSeq === null ? row.sinceSeq : row.ackedSeq + 1,
						actorIn: people,
						limit: MAX_ACTIVITY_LIST_SIZE
					})
					.items.reverse();
				return [
					{
						kind: task ? 'task' : 'epic',
						key: task?.key ?? epic.key,
						title: task?.title ?? epic.title,
						epicKey: epic.key,
						projectKey: owner.key,
						flaggedAt: row.flaggedAt,
						seq: row.lastSeq,
						...(task && { assignee: task.assignee }),
						ackedBy: repos.inbox.acks(row.id).map((ack) => ({
							agent: ack.agent,
							ackedAt: ack.ackedAt,
							upToDate: ack.ackedSeq >= row.lastSeq
						})),
						changes
					}
				];
			});
	}

	count(project?: string): number {
		const { repos } = this.deps;
		return repos.inbox.count(project ? requireProject(repos, project).id : undefined);
	}

	/**
	 * Acknowledges task or epic keys for one agent, up to the given sequence number or the item's
	 * latest change. An unknown key fails before anything is acknowledged.
	 */
	ack(
		agent: string,
		items: (string | { item: string; seq: number })[]
	): { acknowledged: string[] } {
		const { repos } = this.deps;
		const targets = items.map((entry) => {
			const { item, seq } = typeof entry === 'string' ? { item: entry, seq: undefined } : entry;
			const resolved = this.#resolve(item);
			return { ...resolved, seq };
		});
		const at = now();
		return {
			acknowledged: transaction(this.deps.db, () =>
				targets
					.filter(({ target, seq }) => {
						const row = repos.inbox.find(target);
						return (
							row && repos.inbox.ack(row.id, agent, Math.min(seq ?? row.lastSeq, row.lastSeq), at)
						);
					})
					.map(({ key }) => key)
			)
		};
	}

	/** Removes items for every agent; a later person's change flags them again. */
	dismiss(items: string[]): { dismissed: string[] } {
		const targets = items.map((item) => this.#resolve(item));
		return {
			dismissed: transaction(this.deps.db, () =>
				targets.filter(({ target }) => this.deps.repos.inbox.remove(target)).map(({ key }) => key)
			)
		};
	}

	#resolve(item: string): { key: string; target: InboxTarget } {
		const { repos } = this.deps;
		const task = repos.tasks.find(item);
		if (task) return { key: task.key, target: { taskId: task.id } };
		const epic = repos.epics.find(item);
		if (!epic) throw new NotFoundError('Task or epic', item);
		return { key: epic.key, target: { epicId: epic.id } };
	}
}
