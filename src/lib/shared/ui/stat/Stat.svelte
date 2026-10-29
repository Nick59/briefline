<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/shared/lib/utils.ts';

	interface Props {
		label: string;
		value: string | number;
		hint?: Snippet;
		class?: string;
	}

	let { label, value, hint, class: className }: Props = $props();
</script>

<div class={cn('min-w-0 space-y-1', className)}>
	<p class="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
	<p class="font-mono text-lg font-medium tabular-nums">{value}</p>
	{#if hint}
		<div class="text-xs text-muted-foreground">{@render hint()}</div>
	{/if}
</div>
