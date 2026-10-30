<script lang="ts">
	import type { Stage, WorkStatus } from '#lib/shared/domain/constants.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { stageTone, toneClasses } from '#lib/shared/config/tokens/index.ts';
	import { StatusIcon } from '#lib/entities/work-status/index.ts';

	let { status, index, stage }: { status: WorkStatus; index: number; stage?: Stage | null } =
		$props();
	const stageActive = $derived(status === 'in_progress' && !!stage);
</script>

<span
	class={cn(
		'relative z-10 grid size-7 place-items-center rounded-full border-2 bg-background',
		status === 'done' && 'border-status-done',
		status === 'in_progress' &&
			!stageActive &&
			'border-status-in-progress ring-4 ring-status-in-progress/15',
		stageActive &&
			stage && [toneClasses[stageTone[stage]].text, 'border-current ring-4 ring-current/15'],
		status === 'todo' && 'border-border'
	)}
>
	{#if status === 'todo'}
		<span class="font-mono text-[10px] text-muted-foreground">{index + 1}</span>
	{:else}
		<StatusIcon {status} tone={stageActive && stage ? stageTone[stage] : undefined} size={14} />
	{/if}
</span>
