import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { insertText } from '#lib/shared/ui/markdown-editor/index.ts';
import { toast } from 'svelte-sonner';
import ImageIcon from '@lucide/svelte/icons/image-plus';
import type { SlashCommand } from '#lib/shared/ui/markdown-editor/index.ts';
import {
	IMAGE_ACCEPT,
	insertImages,
	isImageFile,
	type ImageSink,
	type ImageTarget
} from './upload.ts';

export function viewSink(view: EditorView): ImageSink {
	return {
		insert: (text) => insertText(view, text),
		replace(from, to) {
			const at = view.state.doc.toString().indexOf(from);
			if (at !== -1) view.dispatch({ changes: { from: at, to: at + from.length, insert: to } });
		}
	};
}

/**
 * Lets a markdown editor take images by paste and drag and drop. The target is read on each
 * event; with no target (the owner does not exist yet) the editor behaves as usual.
 */
export function imageUploadExtension(getTarget: () => ImageTarget | null): Extension {
	const images = (files: FileList | null | undefined) => [...(files ?? [])].filter(isImageFile);

	function upload(files: File[], view: EditorView) {
		const target = getTarget();
		if (!target || files.length === 0) return false;
		void insertImages(viewSink(view), files, target);
		return true;
	}

	return EditorView.domEventHandlers({
		paste: (event, view) => upload(images(event.clipboardData?.files), view),
		dragover: (event) =>
			!!getTarget() && [...(event.dataTransfer?.items ?? [])].some((i) => i.kind === 'file'),
		drop: (event, view) => upload(images(event.dataTransfer?.files), view)
	});
}

/** The `/image` slash command: opens the file picker and uploads the chosen images at the cursor. */
export function imageCommand(getTarget: () => ImageTarget | null): SlashCommand {
	return {
		name: 'image',
		label: 'Image',
		detail: 'Upload a file',
		icon: ImageIcon,
		keywords: ['picture', 'photo', 'upload'],
		apply(view, from, to) {
			view.dispatch({ changes: { from, to }, selection: { anchor: from } });
			const target = getTarget();
			if (!target) return void toast.error('Save first to add images');
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = IMAGE_ACCEPT;
			input.multiple = true;
			input.onchange = () => void insertImages(viewSink(view), [...(input.files ?? [])], target);
			input.click();
		}
	};
}
