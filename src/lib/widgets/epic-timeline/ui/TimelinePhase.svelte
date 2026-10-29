<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { resolve } from '$app/paths';
	import type { PhaseWithProgress, Task } from '#lib/shared/domain/types.ts';
	import { formatDateRange, pluralize } from '#lib/shared/lib/format.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { PhaseMarker } from '#lib/entities/phase/index.ts';
	import { StatusBadge } from '#lib/entities/work-status/index.ts';
	import { PhaseFormDialog } from '#lib/features/phase-form/index.ts';
	import { DeleteButton } from '#lib/features/delete-entity/index.ts';
	import TimelineTaskRow from './TimelineTaskRow.svelte';

	interface Props {
		phase: PhaseWithProgress;
		index: number;
		tasks: Task[];
		projectKey: string;
		epicKey: string;
		isLast: boolean;
	}

	let { phase, index, tasks, projectKey, epicKey, isLast }: Props = $props();
	const dates = $derived(formatDateRange(phase.startDate, phase.endDate));
	const railDone = $derived(phase.effectiveStatus === 'done');
</script>

<li class="group/phase relative grid grid-cols-[1.75rem_1fr] gap-x-3">
	{#if !isLast}
		<span
			class={cn(
				'absolute top-7 bottom-0 left-[calc(0.875rem-1px)] w-(--timeline-rail)',
				railDone ? 'bg-status-done/60' : 'bg-border'
			)}
			aria-hidden="true"
		></span>
	{/if}
	<PhaseMarker status={phase.effectiveStatus} {index} />
	<div class="min-w-0 pb-6">
		<div class="flex min-h-7 items-center justify-between gap-2">
			<div class="flex min-w-0 items-center gap-2">
				<h3 class="truncate text-sm font-semibold">{phase.name}</h3>
				<StatusBadge status={phase.effectiveStatus} />
			</div>
			<div
				class="flex items-center opacity-0 transition-opacity group-focus-within/phase:opacity-100 group-hover/phase:opacity-100"
			>
				<PhaseFormDialog epicId={phase.epicId} {phase}>
					{#snippet trigger({ props })}
						<Button {...props} variant="ghost" size="icon-xs" aria-label="Edit phase {phase.name}"
							><PencilIcon /></Button
						>
					{/snippet}
				</PhaseFormDialog>
				<DeleteButton
					operation="delete_phase"
					input={{ phase: phase.id }}
					what="phase “{phase.name}”"
					consequence="Its tasks stay in the epic without a phase."
				/>
			</div>
		</div>
		<p class="text-xs text-muted-foreground">
			{#if dates}{dates} ·
			{/if}{pluralize(tasks.length, 'task')}
		</p>
		{#if phase.description}
			<p class="mt-1 text-sm text-muted-foreground">{phase.description}</p>
		{/if}
		{#if tasks.length}
			<ul class="-mx-2 mt-2">
				{#each tasks as task (task.id)}
					<TimelineTaskRow
						{task}
						href={resolve('/projects/[project]/epics/[epic]/tasks/[task]', {
							project: projectKey,
							epic: epicKey,
							task: task.key
						})}
					/>
				{/each}
			</ul>
		{/if}
	</div>
</li>
