import { createHash } from 'node:crypto';
import type { Db } from '../../db/connection.ts';

/** Hash of a ticket description as the remote returns it; line endings and edge whitespace do not count. */
export function hashDescription(text: string | null | undefined): string {
	const normalized = (text ?? '').replace(/\r\n?/g, '\n').trim();
	return createHash('sha256').update(normalized).digest('hex');
}

/** Remembers the remote description per linked task, so a pull can tell a remote edit from a stale copy. */
export class DescriptionHashes {
	constructor(private readonly db: Db) {}

	get(taskId: string, connectionId: string, ticketKey: string): string | undefined {
		const row = this.db
			.prepare(
				'SELECT hash FROM ticket_description_hashes WHERE task_id = ? AND connection_id = ? AND ticket_key = ?'
			)
			.get(taskId, connectionId, ticketKey) as { hash: string } | undefined;
		return row?.hash;
	}

	set(taskId: string, connectionId: string, ticketKey: string, hash: string) {
		this.db
			.prepare(
				'INSERT OR REPLACE INTO ticket_description_hashes (task_id, connection_id, ticket_key, hash) VALUES (?, ?, ?, ?)'
			)
			.run(taskId, connectionId, ticketKey, hash);
	}

	clear(taskId: string, connectionId: string, ticketKey: string) {
		this.db
			.prepare(
				'DELETE FROM ticket_description_hashes WHERE task_id = ? AND connection_id = ? AND ticket_key = ?'
			)
			.run(taskId, connectionId, ticketKey);
	}
}
