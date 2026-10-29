<script lang="ts">
	import type { Snippet } from 'svelte';
	import { toneClasses, type Tone } from '#lib/shared/config/tokens/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';

	interface Props {
		tone: Tone;
		variant?: 'soft' | 'outline' | 'dot';
		size?: 'sm' | 'md';
		class?: string;
		children: Snippet;
	}

	let { tone, variant = 'soft', size = 'sm', class: className, children }: Props = $props();
	const classes = $derived(toneClasses[tone]);
</script>

<span
	class={cn(
		'inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
		size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs',
		variant === 'soft' && classes.soft,
		variant === 'outline' && ['border bg-transparent', classes.border, classes.text],
		variant === 'dot' && 'px-0 text-muted-foreground',
		className
	)}
>
	{#if variant === 'dot'}
		<span class={cn('size-1.5 rounded-full', classes.dot)}></span>
	{/if}
	{@render children()}
</span>
