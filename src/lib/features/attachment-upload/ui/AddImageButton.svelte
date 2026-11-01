<script lang="ts">
	import ImagePlusIcon from '@lucide/svelte/icons/image-plus';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { insertImages, type ImageTarget } from '../model/upload.ts';

	interface Props {
		textarea: HTMLTextAreaElement | null;
		/** Null while the owner does not exist yet; the button is then disabled. */
		target: ImageTarget | null;
		class?: string;
	}

	let { textarea, target, class: className }: Props = $props();
	let input = $state<HTMLInputElement | null>(null);

	function picked() {
		const files = [...(input?.files ?? [])];
		if (input) input.value = '';
		if (textarea && target && files.length > 0) void insertImages(textarea, files, target);
	}
</script>

<input
	bind:this={input}
	type="file"
	accept="image/png,image/jpeg,image/gif,image/webp"
	multiple
	hidden
	onchange={picked}
/>
<Button
	type="button"
	variant="ghost"
	size="sm"
	class={className}
	disabled={!target || !textarea}
	title={target ? 'Add image (or paste or drop one into the text)' : 'Save first to add images'}
	onclick={() => input?.click()}
>
	<ImagePlusIcon /> Add image
</Button>
