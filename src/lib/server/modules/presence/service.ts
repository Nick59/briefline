import { isHumanActor } from '#lib/shared/domain/actors.ts';
import { PRESENCE_THROTTLE_MS } from '#lib/shared/domain/constants.ts';
import {
	presenceStatus,
	type AgentPresence,
	type PresenceSnapshot,
	type PresenceTransport
} from '#lib/shared/domain/presence.ts';
import type { PresenceRepository } from './repository.ts';

type Listener = (snapshot: PresenceSnapshot) => void;

interface Seen {
	seenAt: number;
	transport: PresenceTransport;
	persistedAt: number | null;
	announcedAt: number | null;
}

export interface PresenceOptions {
	clock?: () => number;
	/** Actors that are people, not agents. */
	isIgnored: (actor: string) => boolean;
}

/** Tracks when each agent last made a request. The latest time lives in memory; the database and the listeners are told at most once per throttle window. */
export class PresenceService {
	readonly #seen = new Map<string, Seen>();
	readonly #listeners = new Set<Listener>();
	readonly #clock: () => number;
	readonly #isIgnored: (actor: string) => boolean;

	constructor(
		private readonly repo: PresenceRepository,
		{ clock = Date.now, isIgnored }: PresenceOptions
	) {
		this.#clock = clock;
		this.#isIgnored = isIgnored;
		for (const entry of repo.list()) {
			const seenAt = Date.parse(entry.lastSeenAt);
			this.#seen.set(entry.actor, {
				seenAt,
				transport: entry.transport,
				persistedAt: seenAt,
				announcedAt: null
			});
		}
	}

	/** Records a request by `actor`. Returns false when the actor is not an agent. */
	touch(actor: string, transport: PresenceTransport): boolean {
		if (this.#isIgnored(actor)) return false;
		const at = this.#clock();
		const previous = this.#seen.get(actor);
		const wasOnline = previous !== undefined && presenceStatus(previous.seenAt, at) === 'online';
		const entry: Seen = {
			seenAt: at,
			transport,
			persistedAt: previous?.persistedAt ?? null,
			announcedAt: previous?.announcedAt ?? null
		};
		this.#seen.set(actor, entry);

		if (entry.persistedAt === null || at - entry.persistedAt >= PRESENCE_THROTTLE_MS) {
			this.repo.save({ actor, lastSeenAt: new Date(at).toISOString(), transport });
			entry.persistedAt = at;
		}
		if (
			!wasOnline ||
			entry.announcedAt === null ||
			at - entry.announcedAt >= PRESENCE_THROTTLE_MS
		) {
			entry.announcedAt = at;
			const snapshot = this.snapshot();
			for (const listener of this.#listeners) {
				try {
					listener(snapshot);
				} catch (error) {
					console.error('[presence] listener failed', error);
				}
			}
		}
		return true;
	}

	/** Known agents, most recently seen first. */
	list(): AgentPresence[] {
		return [...this.#seen]
			.map(([actor, s]) => ({
				actor,
				lastSeenAt: new Date(s.seenAt).toISOString(),
				transport: s.transport
			}))
			.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.actor.localeCompare(b.actor));
	}

	withStatus() {
		const at = this.#clock();
		return this.list().map((agent) => ({ ...agent, status: presenceStatus(agent.lastSeenAt, at) }));
	}

	snapshot(): PresenceSnapshot {
		return { serverTime: new Date(this.#clock()).toISOString(), agents: this.list() };
	}

	subscribe(listener: Listener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}
}

export const isPresenceIgnored =
	(profileName: () => string | null, anonymous: ReadonlySet<string>) => (actor: string) =>
		anonymous.has(actor) || isHumanActor(actor, profileName());
