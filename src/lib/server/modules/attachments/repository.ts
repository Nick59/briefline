import { all, one, run, type Db } from '../../db/connection.ts';

export interface Attachment {
	id: string;
	projectId: string;
	taskId: string | null;
	specId: string | null;
	filename: string;
	mime: string;
	size: number;
	sha256: string;
	uploadedBy: string;
	createdAt: string;
}

interface AttachmentRow {
	id: string;
	project_id: string;
	task_id: string | null;
	spec_id: string | null;
	filename: string;
	mime: string;
	size: number;
	sha256: string;
	uploaded_by: string;
	created_at: string;
}

const toAttachment = (row: AttachmentRow): Attachment => ({
	id: row.id,
	projectId: row.project_id,
	taskId: row.task_id,
	specId: row.spec_id,
	filename: row.filename,
	mime: row.mime,
	size: row.size,
	sha256: row.sha256,
	uploadedBy: row.uploaded_by,
	createdAt: row.created_at
});

export class AttachmentRepository {
	constructor(private readonly db: Db) {}

	find(id: string): Attachment | undefined {
		const row = one<AttachmentRow>(this.db, 'SELECT * FROM attachments WHERE id = :id', { id });
		return row && toAttachment(row);
	}

	listByProject(projectId: string): Attachment[] {
		return all<AttachmentRow>(
			this.db,
			'SELECT * FROM attachments WHERE project_id = :projectId AND task_id IS NULL AND spec_id IS NULL ORDER BY created_at, rowid',
			{ projectId }
		).map(toAttachment);
	}

	listByTask(taskId: string): Attachment[] {
		return all<AttachmentRow>(
			this.db,
			'SELECT * FROM attachments WHERE task_id = :taskId ORDER BY created_at, rowid',
			{ taskId }
		).map(toAttachment);
	}

	listBySpec(specId: string): Attachment[] {
		return all<AttachmentRow>(
			this.db,
			'SELECT * FROM attachments WHERE spec_id = :specId ORDER BY created_at, rowid',
			{ specId }
		).map(toAttachment);
	}

	allIds(): Set<string> {
		return new Set(all<{ id: string }>(this.db, 'SELECT id FROM attachments').map((r) => r.id));
	}

	insert(attachment: Attachment) {
		run(
			this.db,
			`INSERT INTO attachments (id, project_id, task_id, spec_id, filename, mime, size, sha256, uploaded_by, created_at)
			 VALUES (:id, :projectId, :taskId, :specId, :filename, :mime, :size, :sha256, :uploadedBy, :createdAt)`,
			{ ...attachment }
		);
	}

	delete(id: string) {
		run(this.db, 'DELETE FROM attachments WHERE id = :id', { id });
	}
}
