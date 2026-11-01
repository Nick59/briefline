import type { QuestionStatus } from '#lib/shared/domain/constants.ts';
import type { EpicQuestion, QuestionMessage } from '#lib/shared/domain/types.ts';
import { all, fromJson, one, run, toJson, type Db } from '../../db/connection.ts';

interface QuestionRow {
	id: string;
	epic_id: string;
	position: number;
	question: string;
	context: string | null;
	options: string | null;
	status: string;
	answer: string | null;
	asked_by: string;
	answered_by: string | null;
	created_at: string;
	answered_at: string | null;
}

interface MessageRow {
	id: string;
	question_id: string;
	author: string;
	body: string;
	created_at: string;
}

const toMessage = (row: MessageRow): QuestionMessage => ({
	id: row.id,
	questionId: row.question_id,
	author: row.author,
	body: row.body,
	createdAt: row.created_at
});

const toQuestion = (row: QuestionRow, messages: QuestionMessage[]): EpicQuestion => ({
	id: row.id,
	epicId: row.epic_id,
	position: row.position,
	question: row.question,
	context: row.context,
	options: fromJson<string[]>(row.options, []),
	status: row.status as QuestionStatus,
	answer: row.answer,
	askedBy: row.asked_by,
	answeredBy: row.answered_by,
	createdAt: row.created_at,
	answeredAt: row.answered_at,
	messages
});

export class QuestionRepository {
	constructor(private readonly db: Db) {}

	listByEpic(epicId: string, status?: QuestionStatus): EpicQuestion[] {
		const filter = status ? 'AND status = :status' : '';
		const params: Record<string, string> = status ? { epicId, status } : { epicId };
		const rows = all<QuestionRow>(
			this.db,
			`SELECT * FROM epic_questions WHERE epic_id = :epicId ${filter} ORDER BY position, created_at`,
			params
		);
		const messages = all<MessageRow>(
			this.db,
			`SELECT m.* FROM question_messages m JOIN epic_questions q ON q.id = m.question_id
			 WHERE q.epic_id = :epicId ORDER BY m.created_at, m.rowid`,
			{ epicId }
		).map(toMessage);
		const byQuestion = Map.groupBy(messages, (m) => m.questionId);
		return rows.map((row) => toQuestion(row, byQuestion.get(row.id) ?? []));
	}

	find(id: string): EpicQuestion | undefined {
		const row = one<QuestionRow>(this.db, 'SELECT * FROM epic_questions WHERE id = :id', { id });
		return row && toQuestion(row, this.#messages(id));
	}

	insertMessage(message: QuestionMessage) {
		run(
			this.db,
			`INSERT INTO question_messages (id, question_id, author, body, created_at)
			 VALUES (:id, :questionId, :author, :body, :createdAt)`,
			{ ...message }
		);
	}

	countOpen(epicId: string): number {
		return (
			one<{ n: number }>(
				this.db,
				"SELECT COUNT(*) AS n FROM epic_questions WHERE epic_id = :epicId AND status = 'open'",
				{ epicId }
			)?.n ?? 0
		);
	}

	countByProject(projectId: string): Map<string, { open: number; total: number }> {
		const rows = all<{ epic_id: string; open: number; total: number }>(
			this.db,
			`SELECT q.epic_id, COUNT(*) AS total, SUM(q.status = 'open') AS open FROM epic_questions q
			 JOIN epics e ON e.id = q.epic_id
			 WHERE e.project_id = :projectId GROUP BY q.epic_id`,
			{ projectId }
		);
		return new Map(rows.map((row) => [row.epic_id, { open: row.open, total: row.total }]));
	}

	nextPosition(epicId: string): number {
		return (
			one<{ next: number }>(
				this.db,
				'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM epic_questions WHERE epic_id = :epicId',
				{ epicId }
			)?.next ?? 0
		);
	}

	insert(q: EpicQuestion) {
		run(
			this.db,
			`INSERT INTO epic_questions (id, epic_id, position, question, context, options, status, answer, asked_by, answered_by, created_at, answered_at)
			 VALUES (:id, :epicId, :position, :question, :context, :options, :status, :answer, :askedBy, :answeredBy, :createdAt, :answeredAt)`,
			{ ...this.#params(q), epicId: q.epicId, askedBy: q.askedBy, createdAt: q.createdAt }
		);
	}

	update(q: EpicQuestion) {
		run(
			this.db,
			`UPDATE epic_questions SET question = :question, context = :context, options = :options, status = :status,
			 answer = :answer, answered_by = :answeredBy, answered_at = :answeredAt, position = :position WHERE id = :id`,
			this.#params(q)
		);
	}

	delete(id: string) {
		run(this.db, 'DELETE FROM epic_questions WHERE id = :id', { id });
	}

	#messages(questionId: string): QuestionMessage[] {
		return all<MessageRow>(
			this.db,
			'SELECT * FROM question_messages WHERE question_id = :questionId ORDER BY created_at, rowid',
			{ questionId }
		).map(toMessage);
	}

	#params(q: EpicQuestion) {
		return {
			id: q.id,
			position: q.position,
			question: q.question,
			context: q.context,
			options: q.options.length ? toJson(q.options) : null,
			status: q.status,
			answer: q.answer,
			answeredBy: q.answeredBy,
			answeredAt: q.answeredAt
		};
	}
}
