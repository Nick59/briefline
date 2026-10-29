<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Label } from '#lib/shared/ui/primitives/label/index.js';
	import { cn } from '#lib/shared/lib/utils.ts';

	interface Props {
		label: string;
		for?: string;
		hint?: string;
		class?: string;
		children: Snippet;
	}

	let { label, for: htmlFor, hint, class: className, children }: Props = $props();
</script>

<div class={cn('grid gap-1.5', className)}>
	<Label for={htmlFor} class="text-xs font-medium">{label}</Label>
	{@render children()}
	{#if hint}
		<p class="text-xs text-muted-foreground">{hint}</p>
	{/if}
</div>
