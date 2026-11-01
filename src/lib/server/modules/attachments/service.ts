import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ServiceDeps } from '../../core/deps.ts';
import { InvalidInputError, NotFoundError } from '../../core/errors.ts';
import { newId, now } from '../../core/ids.ts';
import { requireEpic, requireProject, requireTask } from '../../core/lookup.ts';
import type { Attachment } from './repository.ts';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_FILENAME = 200;

export type AttachmentTarget = { type: 'project' | 'task' | 'spec'; id: string };

export interface UploadedAttachment {
	id: string;
	url: string;
	markdown: string;
	size: number;
	mime: string;
}

const startsWith = (data: Uint8Array, bytes: number[], offset = 0) =>
	bytes.every((byte, i) => data[offset + i] === byte);

/** Identifies the image from its bytes; the client's Content-Type and the extension are never trusted. */
export function detectImageMime(data: Uint8Array): string | null {
	if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
	if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (startsWith(data, [0x47, 0x49, 0x46, 0x38]) && (data[4] === 0x37 || data[4] === 0x39)) {
		if (data[5] === 0x61) return 'image/gif';
	}
	// RIFF....WEBP
	if (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8)) {
		return 'image/webp';
	}
	return null;
}

export function sanitizeFilename(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? '';
	// eslint-disable-next-line no-control-regex -- control characters are exactly what is stripped
	const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
	return (clean || 'image').slice(0, MAX_FILENAME);
}

export class AttachmentService {
	constructor(
		private readonly deps: ServiceDeps,
		private readonly dir: string
	) {}

	upload(
		input: { target: AttachmentTarget; filename: string; data: Uint8Array },
		actor: string
	): UploadedAttachment {
		const { data } = input;
		if (data.length === 0) throw new InvalidInputError('The file is empty');
		if (data.length > MAX_ATTACHMENT_BYTES) {
			throw new InvalidInputError(
				`The file is larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`
			);
		}
		const mime = detectImageMime(data);
		if (!mime) {
			throw new InvalidInputError('Only PNG, JPEG, GIF and WebP images can be uploaded');
		}
		const owner = this.#resolve(input.target);
		const filename = sanitizeFilename(input.filename);
		const attachment: Attachment = {
			id: newId(),
			...owner,
			filename,
			mime,
			size: data.length,
			sha256: createHash('sha256').update(data).digest('hex'),
			uploadedBy: actor,
			createdAt: now()
		};

		mkdirSync(this.dir, { recursive: true });
		const path = this.path(attachment.id);
		const temp = `${path}.tmp-${newId()}`;
		writeFileSync(temp, data);
		renameSync(temp, path);
		try {
			this.deps.repos.attachments.insert(attachment);
		} catch (error) {
			rmSync(path, { force: true });
			throw error;
		}
		this.#emit('attachment.added', attachment, actor);
		return {
			id: attachment.id,
			url: `/attachments/${attachment.id}`,
			markdown: `![${filename.replace(/[[\]]/g, '')}](/attachments/${attachment.id})`,
			size: attachment.size,
			mime
		};
	}

	list(target: AttachmentTarget): Attachment[] {
		const { attachments } = this.deps.repos;
		const owner = this.#resolve(target);
		if (target.type === 'task') return attachments.listByTask(owner.taskId!);
		if (target.type === 'spec') return attachments.listBySpec(owner.specId!);
		return attachments.listByProject(owner.projectId);
	}

	find(id: string): Attachment | undefined {
		return this.deps.repos.attachments.find(id);
	}

	get(id: string): Attachment {
		const attachment = this.find(id);
		if (!attachment) throw new NotFoundError('Attachment', id);
		return attachment;
	}

	/** Absolute path of the stored bytes; only meaningful for an id that came from a row. */
	path(id: string): string {
		return join(this.dir, id);
	}

	delete(id: string, actor: string) {
		const attachment = this.get(id);
		this.deps.repos.attachments.delete(id);
		rmSync(this.path(id), { force: true });
		this.#emit('attachment.deleted', attachment, actor);
	}

	/** Removes files whose row is gone, e.g. after an owner was deleted and its rows cascaded. */
	sweepOrphans() {
		let names: string[];
		try {
			names = readdirSync(this.dir);
		} catch {
			return;
		}
		const known = this.deps.repos.attachments.allIds();
		for (const name of names) {
			if (!known.has(name)) rmSync(join(this.dir, name), { force: true });
		}
	}

	#resolve({ type, id }: AttachmentTarget): Pick<Attachment, 'projectId' | 'taskId' | 'specId'> {
		const { repos } = this.deps;
		if (type === 'project') {
			return { projectId: requireProject(repos, id).id, taskId: null, specId: null };
		}
		if (type === 'task') {
			const task = requireTask(repos, id);
			return {
				projectId: requireEpic(repos, task.epicId).projectId,
				taskId: task.id,
				specId: null
			};
		}
		const spec = repos.specs.find(id);
		if (!spec) throw new NotFoundError('Spec', id);
		const projectId = spec.projectId ?? requireEpic(repos, spec.epicId!).projectId;
		return { projectId, taskId: null, specId: spec.id };
	}

	#emit(type: 'attachment.added' | 'attachment.deleted', attachment: Attachment, actor: string) {
		const { repos } = this.deps;
		const target: AttachmentTarget = attachment.taskId
			? { type: 'task', id: attachment.taskId }
			: attachment.specId
				? { type: 'spec', id: attachment.specId }
				: { type: 'project', id: attachment.projectId };
		let epicId: string | null = null;
		let taskId = attachment.taskId;
		let key: string | undefined;
		let title: string | undefined;
		if (attachment.taskId) {
			const task = requireTask(repos, attachment.taskId);
			epicId = task.epicId;
			key = task.key;
			title = task.title;
		} else if (attachment.specId) {
			const spec = repos.specs.find(attachment.specId);
			if (spec) {
				epicId = spec.epicId;
				taskId = spec.taskId;
				title = spec.title;
				key = spec.taskId
					? repos.tasks.find(spec.taskId)?.key
					: spec.epicId
						? repos.epics.find(spec.epicId)?.key
						: undefined;
			}
		}
		this.deps.events.emit({
			type,
			projectId: attachment.projectId,
			epicId,
			taskId,
			actor,
			data: {
				attachmentId: attachment.id,
				filename: attachment.filename,
				size: attachment.size,
				mime: attachment.mime,
				target,
				...(key && { key }),
				...(title && { title })
			}
		});
	}
}
