import { z } from 'zod';
import type { Activity, Page, SessionSummary } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { InvalidInputError, NotFoundError } from '../../core/errors.ts';
import { newId, now } from '../../core/ids.ts';
import { requireProject } from '../../core/lookup.ts';
import { currentSessionId } from '../../core/request-context.ts';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../activity/repository.ts';
import type { ActivityService, Paging } from '../activity/service.ts';
import type { ClientInfo } from './repository.ts';

export const MAX_SUMMARY_LENGTH = 20_000;
export const summarySchema = z.string().max(MAX_SUMMARY_LENGTH);

export interface SessionListQuery extends Paging {
	actor?: string;
	includeEmpty?: boolean;
}

export interface SessionDetail {
	session: SessionSummary;
	activity: Page<Activity>;
}

export interface LastSessionQuery extends Paging {
	project?: string;
	actor?: string;
}

export class SessionService {
	constructor(
		private readonly deps: ServiceDeps,
		private readonly activity: ActivityService
	) {}

	/** Creates a session and returns its id. An existing id is left as it is. */
	start(actor: string, client: ClientInfo = {}, id = newId()): string {
		this.deps.repos.sessions.insert(id, actor, now(), client);
		return id;
	}

	/** Records that the session made a request, creating it first when the id is unknown. */
	touch(id: string, actor: string) {
		const { sessions } = this.deps.repos;
		const at = now();
		sessions.insert(id, actor, at);
		sessions.touch(id, at);
	}

	end(id: string) {
		this.deps.repos.sessions.end(id, now());
	}

	list(query: SessionListQuery = {}): Page<SessionSummary> {
		return this.deps.repos.sessions.list({
			actor: query.actor,
			includeEmpty: query.includeEmpty,
			limit: Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
			offset: Math.max(query.offset ?? 0, 0)
		});
	}

	actors(): string[] {
		return this.deps.repos.sessions.actors();
	}

	get(id: string, paging?: Paging): SessionDetail {
		const session = this.deps.repos.sessions.find(id);
		if (!session) throw new NotFoundError('Session', id);
		return { session, activity: this.activity.forSession(id, paging) };
	}

	/** The previous session with activity; the caller's own session is skipped. */
	last(query: LastSessionQuery = {}): SessionDetail | null {
		const { repos } = this.deps;
		const id = repos.sessions.latestId({
			actor: query.actor,
			projectId: query.project ? requireProject(repos, query.project).id : undefined,
			excludeId: currentSessionId()
		});
		return id ? this.get(id, { limit: query.limit, offset: query.offset }) : null;
	}

	/** Without an id the summary goes to the session of the current MCP request. */
	setSummary(id: string | undefined, summary: string): SessionSummary {
		const target = id ?? currentSessionId();
		if (!target)
			throw new InvalidInputError(
				'This call is not part of an agent session. Pass `session`, or call it over MCP after initialize.'
			);
		const { sessions } = this.deps.repos;
		if (!sessions.exists(target)) throw new NotFoundError('Session', target);
		sessions.setSummary(target, summarySchema.parse(summary).trim() || null);
		return sessions.find(target)!;
	}
}
