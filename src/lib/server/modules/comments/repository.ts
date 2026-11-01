import type { TaskComment } from '#lib/shared/domain/types.ts';
import { all, one, run, type Db } from '../../db/connection.ts';

interface CommentRow {
	id: string;
	task_id: string;
	author: string;
	author_kind: string;
	body: string;
	created_at: string;
	updated_at: string;
}

const toComment = (row: CommentRow): TaskComment => ({
	id: row.id,
	taskId: row.task_id,
	author: row.author,
	authorKind: row.author_kind === 'human' ? 'human' : 'agent',
	body: row.body,
	createdAt: row.created_at,
	updatedAt: row.updated_at
});

export class CommentRepository {
	constructor(private readonly db: Db) {}

	listByTask(taskId: string): TaskComment[] {
		return all<CommentRow>(
			this.db,
			'SELECT * FROM task_comments WHERE task_id = :taskId ORDER BY created_at, rowid',
			{ taskId }
		).map(toComment);
	}

	find(id: string): TaskComment | undefined {
		const row = one<CommentRow>(this.db, 'SELECT * FROM task_comments WHERE id = :id', { id });
		return row && toComment(row);
	}

	insert(comment: TaskComment) {
		run(
			this.db,
			`INSERT INTO task_comments (id, task_id, author, author_kind, body, created_at, updated_at)
			 VALUES (:id, :taskId, :author, :authorKind, :body, :createdAt, :updatedAt)`,
			{ ...comment }
		);
	}

	updateBody(id: string, body: string, updatedAt: string) {
		run(this.db, 'UPDATE task_comments SET body = :body, updated_at = :updatedAt WHERE id = :id', {
			id,
			body,
			updatedAt
		});
	}

	delete(id: string) {
		run(this.db, 'DELETE FROM task_comments WHERE id = :id', { id });
	}
}
