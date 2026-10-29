<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/shared/lib/utils.ts';

	interface Props {
		title: string;
		eyebrow?: Snippet;
		description?: Snippet;
		actions?: Snippet;
		class?: string;
	}

	let { title, eyebrow, description, actions, class: className }: Props = $props();
</script>

<header class={cn('flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
	<div class="min-w-0 space-y-1.5">
		{#if eyebrow}
			<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
				{@render eyebrow()}
			</div>
		{/if}
		<h1 class="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
		{#if description}
			<div class="max-w-3xl text-sm text-muted-foreground">{@render description()}</div>
		{/if}
	</div>
	{#if actions}
		<div class="flex shrink-0 flex-wrap items-center gap-2">{@render actions()}</div>
	{/if}
</header>
