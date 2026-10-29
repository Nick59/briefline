<script lang="ts">
	import { PRIORITY_LABELS, type Priority } from '#lib/shared/domain/constants.ts';
	import { priorityTone, toneClasses } from '#lib/shared/config/tokens/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';

	let { priority, showLabel = true }: { priority: Priority; showLabel?: boolean } = $props();
	const bars = { low: 1, medium: 2, high: 3, urgent: 3 } as const;
</script>

<span
	class={cn(
		'inline-flex items-center gap-1 text-[11px] font-medium',
		toneClasses[priorityTone[priority]].text
	)}
	title="{PRIORITY_LABELS[priority]} priority"
>
	<span class="flex h-3 items-end gap-px" aria-hidden="true">
		{#each [1, 2, 3] as bar (bar)}
			<span
				class={cn(
					'w-[3px] rounded-[1px]',
					bar <= bars[priority] ? toneClasses[priorityTone[priority]].bg : 'bg-muted'
				)}
				style:height="{bar * 4}px"
			></span>
		{/each}
	</span>
	{#if showLabel}{PRIORITY_LABELS[priority]}{:else}<span class="sr-only"
			>{PRIORITY_LABELS[priority]} priority</span
		>{/if}
</span>
