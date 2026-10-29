<script lang="ts">
	import { cn } from '#lib/shared/lib/utils.ts';
	import type { MarkdownExtension } from './extension.ts';
	import { createMarkdownRenderer } from './renderer.ts';
	import { defaultMarkdownExtensions } from './defaults.ts';

	interface Props {
		source: string;
		/** Added after the default extensions. */
		extensions?: MarkdownExtension[];
		/** Replace the default extensions instead of adding to them. */
		replaceDefaults?: boolean;
		class?: string;
	}

	let { source, extensions = [], replaceDefaults = false, class: className }: Props = $props();

	const renderer = $derived(
		createMarkdownRenderer(
			replaceDefaults ? extensions : [...defaultMarkdownExtensions, ...extensions]
		)
	);
	const html = $derived(renderer.render(source));
	const enhancers = $derived(renderer.extensions.flatMap((e) => (e.enhance ? [e.enhance] : [])));
</script>

{#key html}
	<div
		class={cn('md prose prose-sm max-w-none dark:prose-invert', className)}
		{@attach (node) => {
			const cleanups = enhancers.map((enhance) => enhance(node));
			return () => cleanups.forEach((cleanup) => typeof cleanup === 'function' && cleanup());
		}}
	>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderer.ts escapes raw HTML and unsafe URLs -->
		{@html html}
	</div>
{/key}
