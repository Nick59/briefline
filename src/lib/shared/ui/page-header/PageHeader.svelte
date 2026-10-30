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

<header class={cn('space-y-1.5', className)}>
	{#if eyebrow}
		<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
			{@render eyebrow()}
		</div>
	{/if}
	<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
		<h1 class="min-w-0 text-2xl font-semibold tracking-tight text-balance">{title}</h1>
		{#if actions}
			<div class="flex shrink-0 flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
	</div>
	{#if description}
		<div class="max-w-3xl text-sm text-muted-foreground">{@render description()}</div>
	{/if}
</header>
