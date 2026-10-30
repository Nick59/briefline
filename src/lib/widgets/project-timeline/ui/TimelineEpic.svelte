<script lang="ts">
	import { displayKey, displayKeyTitle } from '#lib/shared/domain/display-key.ts';
	import type { Sortable } from '#lib/shared/lib/dnd/index.ts';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import type { EpicSummary, Task } from '#lib/shared/domain/types.ts';
	import { formatDate, pluralize } from '#lib/shared/lib/format.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { KeyChip } from '#lib/shared/ui/key-chip/index.ts';
	import { resolve } from '$app/paths';
	import TimelineTaskRow from '../../epic-timeline/ui/TimelineTaskRow.svelte';
	import { PhaseMarker } from '#lib/entities/phase/index.ts';
	import { StageBadge, StatusBadge } from '#lib/entities/work-status/index.ts';

	interface Props {
		taskSortable: Sortable;
		epic: EpicSummary & { tasks: Task[] };
		projectKey: string;
		index: number;
		isLast: boolean;
		href: string;
	}

	let { epic, index, isLast, href, projectKey, taskSortable }: Props = $props();
	const status = $derived(epic.progress.status);
	const stage = $derived(
		status === 'in_progress' && epic.progress.currentStage && epic.progress.currentStage !== 'dev'
			? epic.progress.currentStage
			: null
	);
</script>

<li class="group/epic relative grid grid-cols-[1.75rem_1fr] gap-x-3">
	{#if !isLast}
		<span
			class={cn(
				'absolute top-7 bottom-0 left-[calc(0.875rem-1px)] w-(--timeline-rail)',
				status === 'done' ? 'bg-status-done/60' : 'bg-border'
			)}
			aria-hidden="true"
		></span>
	{/if}
	<PhaseMarker {status} {index} {stage} />
	<div class="min-w-0 pb-8">
		<div class="flex min-h-7 flex-wrap items-center gap-2">
			<KeyChip value={displayKey(epic)} title={displayKeyTitle(epic)} />
			<h3 class="min-w-0 truncate text-sm font-semibold">
				<a {href} class="hover:underline focus-visible:underline focus-visible:outline-none"
					>{epic.title}</a
				>
			</h3>
			{#if stage}
				<StageBadge {stage} />
			{:else}
				<StatusBadge {status} />
			{/if}
		</div>
		<p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
			<span>{pluralize(epic.phaseCount, 'phase')} · {pluralize(epic.taskCount, 'task')}</span>
			{#if epic.targetDate}
				<span class="inline-flex items-center gap-1"
					><CalendarIcon class="size-3" />{formatDate(epic.targetDate, true)}</span
				>
			{/if}
		</p>
		{#if epic.summary}
			<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{epic.summary}</p>
		{/if}
		<ul class="-mx-2 mt-2 min-h-10" {@attach taskSortable.zone(epic.id)}>
			{#if !epic.tasks.length}<li class="px-2 py-2 text-xs text-muted-foreground">
					Drop tasks here
				</li>{/if}
			{#each epic.tasks as task (task.id)}
				{#if taskSortable.over?.zone === epic.id && taskSortable.over.beforeId === task.id}<li
						class="h-0.5 bg-brand"
						aria-hidden="true"
					></li>{/if}
				<TimelineTaskRow
					sortable={taskSortable}
					zone={epic.id}
					{task}
					href={resolve('/projects/[project]/epics/[epic]/tasks/[task]', {
						project: projectKey,
						epic: epic.key,
						task: task.key
					})}
				/>
			{/each}
			{#if taskSortable.over?.zone === epic.id && taskSortable.over.beforeId === null}<li
					class="h-0.5 bg-brand"
					aria-hidden="true"
				></li>{/if}
		</ul>
	</div>
</li>
