import type { AgentPresence } from '#lib/shared/domain/presence.ts';
import { all, run, type Db } from '../../db/connection.ts';

interface PresenceRow {
	actor: string;
	last_seen_at: string;
	transport: string;
}

export class PresenceRepository {
	constructor(private readonly db: Db) {}

	list(): AgentPresence[] {
		return all<PresenceRow>(this.db, 'SELECT * FROM agent_presence').map((row) => ({
			actor: row.actor,
			lastSeenAt: row.last_seen_at,
			transport: row.transport as AgentPresence['transport']
		}));
	}

	save(entry: AgentPresence) {
		run(
			this.db,
			`INSERT INTO agent_presence (actor, last_seen_at, transport) VALUES (:actor, :at, :transport)
			 ON CONFLICT(actor) DO UPDATE SET last_seen_at = :at, transport = :transport`,
			{ actor: entry.actor, at: entry.lastSeenAt, transport: entry.transport }
		);
	}
}
