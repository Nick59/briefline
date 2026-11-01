import type { Activity, Page } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { HUMAN_ACTORS } from '#lib/shared/domain/actors.ts';
import { InvalidInputError } from '../../core/errors.ts';
import { newId, now } from '../../core/ids.ts';
import { currentSessionId } from '../../core/request-context.ts';
import { requireEpic, requireProject, requireTask } from '../../core/lookup.ts';
import { withTicketKey } from '#lib/shared/lib/ticket-key.ts';
import type { ActivityWho } from '#lib/shared/domain/actors.ts';
import { describeEvent } from './describe.ts';

export interface Paging {
	limit?: number;
	offset?: number;
}

const withTicket = (activity: Activity): Activity => {
	const key = activity.data.key;
	if (!activity.ticket || typeof key !== 'string') return activity;
	return { ...activity, message: withTicketKey(activity.message, key, activity.ticket.key) };
};

const rewrite = (page: Page<Activity>): Page<Activity> => ({
	...page,
	items: page.items.map(withTicket)
});

export const DEFAULT_CHANGES_LIMIT = 50;
export const MAX_CHANGES_LIMIT = 200;

export interface ChangesQuery {
	since?: string;
	project?: string;
	epic?: string;
	excludeOwn: boolean;
	limit: number;
}

export interface ChangesResult {
	items: (Activity & { cursor: string })[];
	cursor: string;
	hasMore: boolean;
	/** Entries between the starting cursor and the oldest kept entry were deleted. */
	gap: boolean;
}

export interface ActivityQuery extends Paging {
	project?: string;
	actor?: string;
	who?: ActivityWho;
}

const CURSOR_PATTERN = /^act_(\d{1,15})$/;
const encodeCursor = (seq: number) => `act_${seq}`;
function decodeCursor(cursor: string): number {
	const match = CURSOR_PATTERN.exec(cursor);
	if (!match) throw new InvalidInputError(`'${cursor}' is not a cursor returned by this API`);
	return Number(match[1]);
}

export class ActivityService {
	constructor(private readonly deps: ServiceDeps) {
		deps.events.subscribe((event) => {
			// The epic row is already gone when an epic is deleted, so the entry keeps no epic link.
			const epicId = event.type === 'epic.deleted' ? null : event.epicId;
			deps.repos.activity.insert({
				id: newId(),
				projectId: event.projectId,
				epicId,
				taskId: event.taskId,
				actor: event.actor,
				action: event.type,
				message: describeEvent(event),
				data: event.data as Record<string, unknown>,
				sessionId: currentSessionId(),
				createdAt: now()
			});
		});
	}

	/** The external ticket key of the task, or of the epic for epic events and epic specs. */
	externalKeyOf(event: {
		type: string;
		taskId: string | null;
		epicId: string | null;
	}): string | null {
		const { repos } = this.deps;
		const ref = event.taskId
			? repos.tasks.find(event.taskId)?.externalRef
			: (event.type.startsWith('epic.') ||
						event.type.startsWith('spec.') ||
						event.type.startsWith('question.')) &&
				  event.epicId
				? repos.epics.find(event.epicId)?.externalRef
				: null;
		return ref?.key ?? null;
	}

	recent(paging?: Paging): Page<Activity> {
		return rewrite(this.deps.repos.activity.list({ ...paging }));
	}

	/** All activity, filtered by project, actor, and people or agents. */
	list(query: ActivityQuery = {}): Page<Activity> {
		const { repos } = this.deps;
		const { project, actor, who = 'all', ...paging } = query;
		const name = repos.profile.get()?.name;
		const people = name ? [...HUMAN_ACTORS, name] : [...HUMAN_ACTORS];
		return rewrite(
			repos.activity.list({
				projectId: project ? requireProject(repos, project).id : undefined,
				actor,
				actorIn: who === 'people' ? people : undefined,
				actorNotIn: who === 'agents' ? people : undefined,
				...paging
			})
		);
	}

	actors(): string[] {
		return this.deps.repos.activity.actors();
	}

	forProject(idOrKey: string, paging?: Paging): Page<Activity> {
		return rewrite(
			this.deps.repos.activity.list({
				projectId: requireProject(this.deps.repos, idOrKey).id,
				...paging
			})
		);
	}

	forEpic(idOrKey: string, paging?: Paging): Page<Activity> {
		return rewrite(
			this.deps.repos.activity.list({
				epicId: requireEpic(this.deps.repos, idOrKey).id,
				...paging
			})
		);
	}

	forSession(id: string, paging?: Paging): Page<Activity> {
		return rewrite(this.deps.repos.activity.list({ sessionId: id, ...paging }));
	}

	forTask(idOrKey: string, paging?: Paging): Page<Activity> {
		return rewrite(
			this.deps.repos.activity.list({
				taskId: requireTask(this.deps.repos, idOrKey).id,
				...paging
			})
		);
	}

	/**
	 * Entries after a cursor, oldest first. The actor's stored cursor stands in for a missing
	 * `since` and moves to the returned cursor; a null actor is anonymous and stores nothing.
	 */
	changes(query: ChangesQuery, actor: string | null): ChangesResult {
		const { repos } = this.deps;
		const projectId = query.project ? requireProject(repos, query.project).id : undefined;
		const epicId = query.epic ? requireEpic(repos, query.epic).id : undefined;
		const scope =
			[projectId && `project:${projectId}`, epicId && `epic:${epicId}`].filter(Boolean).join('|') ||
			'all';

		const start = query.since ?? (actor ? repos.activity.storedCursor(actor, scope) : null);
		const filter = {
			projectId,
			epicId,
			excludeActor: query.excludeOwn && actor ? actor : undefined
		};
		const rows = start
			? repos.activity.changes({ ...filter, after: decodeCursor(start), limit: query.limit + 1 })
			: repos.activity.changes({ ...filter, limit: query.limit, newest: true });
		const oldest = repos.activity.oldestSeq();
		const gap = start !== null && oldest !== null && decodeCursor(start) < oldest - 1;
		const hasMore = rows.length > query.limit;
		const page = rows.slice(0, query.limit);

		const last = page.at(-1);
		const cursor = last ? encodeCursor(last.seq) : (start ?? encodeCursor(repos.activity.head()));
		if (actor) repos.activity.storeCursor(actor, scope, cursor, now());
		return {
			items: page.map(({ seq, activity }) => ({
				...withTicket(activity),
				cursor: encodeCursor(seq)
			})),
			cursor,
			hasMore,
			gap
		};
	}
}
