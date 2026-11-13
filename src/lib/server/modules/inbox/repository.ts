import { all, one, run, type Db, type Params } from '../../db/connection.ts';

export type InboxTarget = { taskId: string } | { epicId: string };

export type InboxRow = {
	id: number;
	sinceSeq: number;
	lastSeq: number;
	flaggedAt: string;
	/** The calling agent's acknowledged sequence number. */
	ackedSeq: number | null;
} & ({ taskId: string; epicId: null } | { taskId: null; epicId: string });

export interface InboxAck {
	agent: string;
	ackedSeq: number;
	ackedAt: string;
}

interface Row {
	id: number;
	task_id: string | null;
	epic_id: string | null;
	since_seq: number;
	last_seq: number;
	flagged_at: string;
	acked_seq: number | null;
}

const column = (target: InboxTarget) => ('taskId' in target ? 'task_id' : 'epic_id');
const idOf = (target: InboxTarget) => ('taskId' in target ? target.taskId : target.epicId);

// A task item belongs to its epic's project, an epic item to its own.
const scope = (projectId?: string) =>
	projectId
		? {
				join: `LEFT JOIN tasks t ON t.id = i.task_id
				       JOIN epics e ON e.id = COALESCE(i.epic_id, t.epic_id)`,
				where: ['e.project_id = :projectId'],
				params: { projectId } as Params
			}
		: { join: '', where: [] as string[], params: {} as Params };

const whereOf = (conditions: string[]) =>
	conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

export class InboxRepository {
	constructor(private readonly db: Db) {}

	/** A flagged target keeps its first sequence number and moves its last one. */
	flag(target: InboxTarget, seq: number, flaggedAt: string) {
		run(
			this.db,
			`INSERT INTO inbox (${column(target)}, since_seq, last_seq, flagged_at)
			 VALUES (:id, :seq, :seq, :flaggedAt)
			 ON CONFLICT(${column(target)}) DO UPDATE SET last_seq = :seq`,
			{ id: idOf(target), seq, flaggedAt }
		);
	}

	find(target: InboxTarget): { id: number; lastSeq: number } | undefined {
		const row = one<{ id: number; last_seq: number }>(
			this.db,
			`SELECT id, last_seq FROM inbox WHERE ${column(target)} = :id`,
			{ id: idOf(target) }
		);
		return row && { id: row.id, lastSeq: row.last_seq };
	}

	/** Moves the agent's acknowledgement forward, never back. Returns whether it advanced. */
	ack(itemId: number, agent: string, seq: number, at: string): boolean {
		const result = run(
			this.db,
			`INSERT INTO inbox_acks (item_id, agent, acked_seq, acked_at) VALUES (:itemId, :agent, :seq, :at)
			 ON CONFLICT(item_id, agent) DO UPDATE SET acked_seq = excluded.acked_seq, acked_at = excluded.acked_at
			 WHERE excluded.acked_seq > acked_seq`,
			{ itemId, agent, seq, at }
		);
		return Number(result.changes) > 0;
	}

	acks(itemId: number): InboxAck[] {
		return all<{ agent: string; acked_seq: number; acked_at: string }>(
			this.db,
			'SELECT agent, acked_seq, acked_at FROM inbox_acks WHERE item_id = :itemId ORDER BY acked_at',
			{ itemId }
		).map((row) => ({ agent: row.agent, ackedSeq: row.acked_seq, ackedAt: row.acked_at }));
	}

	remove(target: InboxTarget): boolean {
		const result = run(this.db, `DELETE FROM inbox WHERE ${column(target)} = :id`, {
			id: idOf(target)
		});
		return Number(result.changes) > 0;
	}

	/** With an agent, only the items it has not acknowledged up to their latest change. */
	list(projectId?: string, agent?: string): InboxRow[] {
		const { join, where, params } = scope(projectId);
		const conditions = agent
			? [...where, '(k.acked_seq IS NULL OR k.acked_seq < i.last_seq)']
			: where;
		return all<Row>(
			this.db,
			`SELECT i.*, k.acked_seq FROM inbox i ${join}
			 LEFT JOIN inbox_acks k ON k.item_id = i.id AND k.agent = :agent
			 ${whereOf(conditions)} ORDER BY i.since_seq`,
			{ ...params, agent: agent ?? null }
		).map(
			(row) =>
				({
					id: row.id,
					taskId: row.task_id,
					epicId: row.epic_id,
					sinceSeq: row.since_seq,
					lastSeq: row.last_seq,
					flaggedAt: row.flagged_at,
					ackedSeq: row.acked_seq
				}) as InboxRow
		);
	}

	/** Items with a change that no agent has acknowledged. */
	count(projectId?: string): number {
		const { join, where, params } = scope(projectId);
		return one<{ n: number }>(
			this.db,
			`SELECT COUNT(*) AS n FROM inbox i ${join}
			 ${whereOf([
					...where,
					'i.last_seq > COALESCE((SELECT MAX(acked_seq) FROM inbox_acks WHERE item_id = i.id), 0)'
				])}`,
			params
		)!.n;
	}
}
