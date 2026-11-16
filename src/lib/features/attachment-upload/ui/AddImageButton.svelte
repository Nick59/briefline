<script lang="ts">
	import type { EditorView } from '@codemirror/view';
	import ImagePlusIcon from '@lucide/svelte/icons/image-plus';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { viewSink } from '../model/attach.ts';
	import { IMAGE_ACCEPT, insertImages, type ImageTarget } from '../model/upload.ts';

	interface Props {
		view: EditorView | null;
		/** Null while the owner does not exist yet; the button is then disabled. */
		target: ImageTarget | null;
		class?: string;
	}

	let { view, target, class: className }: Props = $props();
	let input = $state<HTMLInputElement | null>(null);

	function picked() {
		const files = [...(input?.files ?? [])];
		if (input) input.value = '';
		if (view && target && files.length > 0) void insertImages(viewSink(view), files, target);
	}
</script>

<input bind:this={input} type="file" accept={IMAGE_ACCEPT} multiple hidden onchange={picked} />
<Button
	type="button"
	variant="ghost"
	size="sm"
	class={className}
	disabled={!target || !view}
	title={target ? 'Add image (or paste or drop one into the text)' : 'Save first to add images'}
	onclick={() => input?.click()}
>
	<ImagePlusIcon /> Add image
</Button>
