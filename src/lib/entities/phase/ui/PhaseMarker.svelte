<script lang="ts">
	import type { WorkStatus } from '#lib/shared/domain/constants.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { StatusIcon } from '#lib/entities/work-status/index.ts';

	let { status, index }: { status: WorkStatus; index: number } = $props();
</script>

<span
	class={cn(
		'relative z-10 grid size-7 place-items-center rounded-full border-2 bg-background',
		status === 'done' && 'border-status-done',
		status === 'in_progress' && 'border-status-in-progress ring-4 ring-status-in-progress/15',
		status === 'todo' && 'border-border'
	)}
>
	{#if status === 'todo'}
		<span class="font-mono text-[10px] text-muted-foreground">{index + 1}</span>
	{:else}
		<StatusIcon {status} size={14} />
	{/if}
</span>
