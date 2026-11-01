import { createReadStream, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { toFailure } from '../api/execute.ts';
import { InvalidInputError } from '../core/errors.ts';
import type { Container } from '../container.ts';
import { MAX_ATTACHMENT_BYTES } from '../modules/attachments/service.ts';
import { errorResponse } from './responses.ts';

const TARGET_TYPES = ['project', 'task', 'spec'] as const;

export function serveAttachment({ attachments }: Container, id: string): Response {
	const attachment = attachments.find(id);
	if (!attachment || !existsSync(attachments.path(id))) {
		return errorResponse(404, 'not_found', `Attachment '${id}' was not found`);
	}
	return new Response(Readable.toWeb(createReadStream(attachments.path(id))) as ReadableStream, {
		headers: {
			'content-type': attachment.mime,
			'content-length': String(attachment.size),
			'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
			// The bytes were checked as an image on upload; nosniff and the empty CSP keep them from ever running as anything else.
			'x-content-type-options': 'nosniff',
			'cache-control': 'private, max-age=31536000, immutable',
			'content-security-policy': "default-src 'none'"
		}
	});
}

/** Multipart upload used by the dashboard; agents call the upload_attachment operation instead. */
export async function uploadFromForm(app: Container, request: Request): Promise<Response> {
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return errorResponse(400, 'invalid_input', 'Send multipart/form-data with a file field');
	}
	const file = form.get('file');
	const targetType = String(form.get('targetType') ?? '');
	const targetId = String(form.get('targetId') ?? '');

	try {
		if (!(file instanceof File)) throw new InvalidInputError('The file field is missing');
		const type = TARGET_TYPES.find((t) => t === targetType);
		if (!type || !targetId) {
			throw new InvalidInputError('targetType (project, task or spec) and targetId are required');
		}
		if (file.size > MAX_ATTACHMENT_BYTES) {
			throw new InvalidInputError(
				`The file is larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`
			);
		}
		const result = app.attachments.upload(
			{
				target: { type, id: targetId },
				filename: file.name,
				data: new Uint8Array(await file.arrayBuffer())
			},
			app.profile.dashboardActor()
		);
		return Response.json(result, { status: 201 });
	} catch (error) {
		const failure = toFailure(error);
		return Response.json(failure.body, { status: failure.status });
	}
}
