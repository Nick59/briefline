<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MarkdownViewer, type MarkdownExtension } from '#lib/shared/ui/markdown/index.ts';
	import type { Spec } from '#lib/shared/domain/types.ts';
	import HumanBrief from './HumanBrief.svelte';

	interface Props {
		spec: Spec;
		extensions?: MarkdownExtension[];
		/** Shown when the spec has no brief yet. */
		empty: Snippet;
		class?: string;
	}

	let { spec, extensions = [], empty, class: className }: Props = $props();

	/** Diagrams from the spec, shown with the brief because they are often the clearest part for humans. */
	const diagrams = $derived(
		[...spec.content.matchAll(/^```mermaid[^\n]*\n[\s\S]*?^```/gm)]
			.map((match) => match[0])
			.join('\n\n')
	);
</script>

<div class={className}>
	{#if spec.brief}
		<HumanBrief brief={spec.brief} />
	{:else}
		{@render empty()}
	{/if}
	{#if diagrams}
		<section class="mt-6 space-y-2">
			<h4 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Diagrams</h4>
			<MarkdownViewer source={diagrams} {extensions} />
		</section>
	{/if}
</div>
