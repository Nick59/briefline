import { toast } from 'svelte-sonner';

export type ImageTarget = { type: 'project' | 'task' | 'spec'; id: string };

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

/** Changing the value from code does not notify a bound textarea unless it receives an input event. */
function setValue(textarea: HTMLTextAreaElement, value: string) {
	textarea.value = value;
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Inserts a placeholder at the cursor per image, then swaps each for the markdown the server returns. */
export async function insertImages(
	textarea: HTMLTextAreaElement,
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
			textarea.setRangeText(placeholder, textarea.selectionStart, textarea.selectionEnd, 'end');
			setValue(textarea, textarea.value);
			let replacement = '';
			try {
				replacement = await uploadImage(file, target);
			} catch (error) {
				toast.error(error instanceof Error ? error.message : 'Upload failed');
			}
			// The user may have kept typing, so the placeholder is found again instead of using its old offset.
			const at = textarea.value.indexOf(placeholder);
			if (at !== -1) {
				setValue(
					textarea,
					textarea.value.replace(placeholder, () => replacement)
				);
			}
		})
	);
}
