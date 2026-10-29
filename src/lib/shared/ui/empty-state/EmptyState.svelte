<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/shared/lib/utils.ts';

	interface Props {
		title: string;
		description?: string;
		icon?: Snippet;
		action?: Snippet;
		class?: string;
	}

	let { title, description, icon, action, class: className }: Props = $props();
</script>

<div
	class={cn(
		'flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center',
		className
	)}
>
	{#if icon}
		<div class="mb-1 text-muted-foreground [&_svg]:size-6">{@render icon()}</div>
	{/if}
	<p class="text-sm font-medium">{title}</p>
	{#if description}
		<p class="max-w-sm text-sm text-muted-foreground">{description}</p>
	{/if}
	{#if action}
		<div class="mt-2">{@render action()}</div>
	{/if}
</div>
