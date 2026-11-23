import { z } from 'zod';
import type { Activity, Page, SessionSummary } from '#lib/shared/domain/types.ts';
import { ANONYMOUS_ACTORS, isHumanActor } from '#lib/shared/domain/actors.ts';
import { PRESENCE_OFFLINE_MS, PRESENCE_ONLINE_MS } from '#lib/shared/domain/constants.ts';
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

export const MEANWHILE_MAX = 20;

export interface Meanwhile {
	items: Pick<Activity, 'actor' | 'message' | 'target' | 'createdAt'>[];
	andMore: number;
}

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
		this.#insert(id, actor, now(), client);
		return id;
	}

	/** Records that the session made a request, creating it first when the id is unknown. */
	touch(id: string, actor: string) {
		const { sessions } = this.deps.repos;
		const at = now();
		if (!sessions.exists(id)) this.#insert(id, actor, at);
		sessions.touch(id, at);
	}

	/** The actor a session acts as: its registered agent name, or the distinct one it was given. */
	actorOf(id: string): string | null {
		return this.deps.repos.sessions.actorOf(id);
	}

	/** Names the current MCP session as an agent (default `agent`); a name held by an online session gets the lowest free `-<n>` suffix; an away or offline holder is ended by the claim. */
	register(input: { repo: string; name?: string; role?: string }) {
		const { repos } = this.deps;
		const id = currentSessionId();
		if (!id)
			throw new InvalidInputError(
				'This call is not part of an agent session. Call register_agent over MCP after initialize.'
			);
		const kept = repos.sessions.find(id)?.name;
		const base = `${input.repo.split('/').pop()}:${input.name ?? kept ?? 'agent'}`;
		if (this.#isPerson(base))
			throw new InvalidInputError(`'${base}' is the name of a person and cannot be an agent`);
		const { agent, name } = this.#claim(
			id,
			input.repo,
			input.name ?? kept ?? 'agent',
			input.role ?? null
		);
		return { agent, repo: input.repo, name, role: input.role ?? null, session: id };
	}

	/** The stored name keeps its `-<n>` suffix: a suffix cannot be told from a name that ends in a number. */
	#insert(id: string, actor: string, at: string, client: ClientInfo = {}) {
		const { sessions } = this.deps.repos;
		const [, repo, name] = actor.match(/^([\w.-]{1,100}):([\w.-]{1,40})$/) ?? [];
		if (!repo || this.#isPerson(actor)) {
			sessions.insert(id, this.#distinctActor(actor, id), at, client);
			return;
		}
		sessions.insert(id, actor, at, client);
		this.#claim(id, repo, name, null);
	}

	#isPerson(actor: string) {
		return ANONYMOUS_ACTORS.has(actor) || isHumanActor(actor, this.deps.repos.profile.get()?.name);
	}

	#claim(id: string, repo: string, name: string, role: string | null) {
		const { repos } = this.deps;
		const base = `${repo.split('/').pop()}:${name}`;
		let n = 1;
		while (this.#held(n === 1 ? base : `${base}-${n}`, id, PRESENCE_ONLINE_MS)) n++;
		const agent = n === 1 ? base : `${base}-${n}`;
		const stored = agent.slice(agent.indexOf(':') + 1);
		repos.sessions.endHolders(agent, id, now());
		repos.sessions.register(id, agent, { repo, name: stored, role });
		repos.sessions.setCursor(id, repos.activity.head());
		return { agent, name: stored };
	}

	/** What other actors did since the session's last response; null when nothing, or on the first call. */
	meanwhile(id: string, actor: string): Meanwhile | null {
		const { activity, sessions } = this.deps.repos;
		const cursor = sessions.cursor(id);
		sessions.setCursor(id, activity.head());
		if (cursor === null) return null;
		const page = activity.list({
			sinceSeq: cursor + 1,
			actorNotIn: [actor],
			ascending: true,
			limit: MEANWHILE_MAX
		});
		if (page.items.length === 0) return null;
		return {
			items: page.items.map(({ actor, message, target, createdAt }) => ({
				actor,
				message,
				target,
				createdAt
			})),
			andMore: page.total - page.items.length
		};
	}

	registrations() {
		return this.deps.repos.sessions.registrations();
	}

	#held(actor: string, exceptId: string | null, withinMs = PRESENCE_OFFLINE_MS) {
		const cutoff = new Date(Date.now() - withinMs).toISOString();
		return this.deps.repos.sessions.actorHeld(actor, exceptId, cutoff);
	}

	/** An unregistered agent that shares its header actor with a live session gets `<actor>-<n>`. */
	#distinctActor(actor: string, id: string): string {
		if (ANONYMOUS_ACTORS.has(actor) || isHumanActor(actor, this.deps.repos.profile.get()?.name))
			return actor;
		for (let n = 1; ; n++) {
			const candidate = n === 1 ? actor : `${actor}-${n}`;
			if (!this.#held(candidate, id)) return candidate;
		}
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
