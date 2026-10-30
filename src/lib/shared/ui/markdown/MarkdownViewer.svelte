<script lang="ts">
	import { cn } from '#lib/shared/lib/utils.ts';
	import type { MarkdownExtension } from './extension.ts';
	import { createMarkdownRenderer } from './renderer.ts';
	import { defaultMarkdownExtensions } from './defaults.ts';
	import { DiagramZoomDialog } from '#lib/shared/ui/diagram-zoom/index.ts';

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
	let zoomOpen = $state(false);
	let zoomSvg = $state('');

	function openDiagram(event: MouseEvent) {
		const figure = (event.target as Element).closest<HTMLElement>('figure.md-mermaid');
		if (figure?.dataset.state !== 'ready') return;
		// Selecting text inside the diagram should not open the viewer.
		if (window.getSelection()?.toString()) return;
		zoomSvg = figure.querySelector('.md-mermaid-output')?.innerHTML ?? '';
		zoomOpen = zoomSvg !== '';
	}

	const enhancers = $derived(renderer.extensions.flatMap((e) => (e.enhance ? [e.enhance] : [])));
</script>

{#key html}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class={cn('md prose prose-sm max-w-none dark:prose-invert', className)}
		onclick={openDiagram}
		{@attach (node) => {
			const cleanups = enhancers.map((enhance) => enhance(node));
			return () => cleanups.forEach((cleanup) => typeof cleanup === 'function' && cleanup());
		}}
	>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderer.ts escapes raw HTML and unsafe URLs -->
		{@html html}
	</div>
{/key}

<DiagramZoomDialog bind:open={zoomOpen} svg={zoomSvg} />
