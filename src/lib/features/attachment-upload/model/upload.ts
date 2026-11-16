import { toast } from 'svelte-sonner';

export type ImageTarget = { type: 'project' | 'task' | 'spec'; id: string };

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

const MAX_BYTES = 10 * 1024 * 1024;

export const isImageFile = (file: File) => file.type.startsWith('image/');

async function uploadImage(file: File, target: ImageTarget): Promise<string> {
	const form = new FormData();
	form.set('file', file, file.name || 'image.png');
	form.set('targetType', target.type);
	form.set('targetId', target.id);
	const response = await fetch('/attachments', { method: 'POST', body: form });
	const body = await response.json().catch(() => null);
	if (!response.ok) throw new Error(body?.error?.message ?? `Upload failed (${response.status})`);
	return body.markdown;
}

export interface ImageSink {
	/** Inserts text at the cursor. */
	insert(text: string): void;
	/** Swaps the first occurrence of `from` for `to`; nothing happens when it is gone. */
	replace(from: string, to: string): void;
}

/** Inserts a placeholder at the cursor per image, then swaps each for the markdown the server returns. */
export async function insertImages(
	sink: ImageSink,
	files: File[],
	target: ImageTarget
): Promise<void> {
	await Promise.all(
		files.map(async (file) => {
			const name = file.name || 'image';
			const placeholder = `![Uploading ${name}…]()`;
			if (file.size > MAX_BYTES) {
				toast.error(`${name} is larger than 10 MB`);
				return;
			}
			sink.insert(placeholder);
			let replacement = '';
			try {
				replacement = await uploadImage(file, target);
			} catch (error) {
				toast.error(error instanceof Error ? error.message : 'Upload failed');
			}
			// The user may have kept typing, so the placeholder is found again instead of using its old offset.
			sink.replace(placeholder, replacement);
		})
	);
}
