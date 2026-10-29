<script lang="ts">
	import {
		STATUS_LABELS,
		WORK_STATUSES,
		STAGE_LABELS,
		type Stage
	} from '#lib/shared/domain/constants.ts';
	import type { Task } from '#lib/shared/domain/types.ts';
	import { stageTone } from '#lib/shared/config/tokens/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { StatusIcon, StageIcon } from '#lib/entities/work-status/index.ts';
	import { moveTask } from '../model/move-task.ts';

	let { task, stage }: { task: Task; stage: Stage } = $props();
</script>

<div class="flex items-center justify-between gap-3 rounded-lg border bg-card p-2 pl-3">
	<span class="flex items-center gap-2 text-sm font-medium"
		><StageIcon {stage} />{STAGE_LABELS[stage]}</span
	>
	<div
		class="flex rounded-md bg-muted p-0.5"
		role="radiogroup"
		aria-label="{STAGE_LABELS[stage]} status"
	>
		{#each WORK_STATUSES as status (status)}
			{@const active = task.stages[stage] === status}
			<button
				type="button"
				role="radio"
				aria-checked={active}
				class={cn(
					'flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
					active ? 'bg-card font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground'
				)}
				onclick={() => !active && moveTask(task.id, stage, status)}
			>
				<StatusIcon {status} tone={status === 'todo' ? undefined : stageTone[stage]} size={12} />
				{STATUS_LABELS[status]}
			</button>
		{/each}
	</div>
</div>
