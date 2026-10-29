<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/shared/lib/utils.ts';

	interface Props {
		title: string;
		count?: number;
		actions?: Snippet;
		children: Snippet;
		class?: string;
	}

	let { title, count, actions, children, class: className }: Props = $props();
</script>

<section class={cn('space-y-3', className)}>
	<div class="flex min-h-8 items-center justify-between gap-2">
		<h2
			class="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
		>
			{title}
			{#if count !== undefined}
				<span class="rounded bg-muted px-1.5 font-mono text-[10px] tabular-nums">{count}</span>
			{/if}
		</h2>
		{#if actions}
			<div class="flex items-center gap-1">{@render actions()}</div>
		{/if}
	</div>
	{@render children()}
</section>
