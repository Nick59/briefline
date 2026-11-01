import type { Attachment } from 'svelte/attachments';
import { insertImages, isImageFile, type ImageTarget } from './upload.ts';

/**
 * Lets a markdown textarea take images by paste and drag and drop. The target is read on each
 * event; with no target (the owner does not exist yet) the textarea behaves as usual.
 */
export function imageUpload(getTarget: () => ImageTarget | null): Attachment<HTMLTextAreaElement> {
	return (textarea) => {
		const images = (files: FileList | null | undefined) => [...(files ?? [])].filter(isImageFile);

		function onpaste(event: ClipboardEvent) {
			const target = getTarget();
			const files = images(event.clipboardData?.files);
			if (!target || files.length === 0) return;
			event.preventDefault();
			void insertImages(textarea, files, target);
		}

		function ondragover(event: DragEvent) {
			if (getTarget() && [...(event.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) {
				event.preventDefault();
			}
		}

		function ondrop(event: DragEvent) {
			const target = getTarget();
			const files = images(event.dataTransfer?.files);
			if (!target || files.length === 0) return;
			event.preventDefault();
			void insertImages(textarea, files, target);
		}

		textarea.addEventListener('paste', onpaste);
		textarea.addEventListener('dragover', ondragover);
		textarea.addEventListener('drop', ondrop);
		return () => {
			textarea.removeEventListener('paste', onpaste);
			textarea.removeEventListener('dragover', ondragover);
			textarea.removeEventListener('drop', ondrop);
		};
	};
}
