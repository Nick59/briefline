<script lang="ts">
	import { resolve } from '$app/paths';
	import { STATUS_LABELS, type Stage, type WorkStatus } from '#lib/shared/domain/constants.ts';
	import type { Task } from '#lib/shared/domain/types.ts';
	import { stageTone } from '#lib/shared/config/tokens/index.ts';
	import type { Sortable } from '#lib/shared/lib/dnd/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { StatusIcon } from '#lib/entities/work-status/index.ts';
	import { TaskCard } from '#lib/entities/task/index.ts';
	import { StageStatusMenu } from '#lib/features/change-task-status/index.ts';

	interface Props {
		stage: Stage;
		status: WorkStatus;
		tasks: Task[];
		projectKey: string;
		epicKey: string;
		sortable: Sortable;
	}

	let { stage, status, tasks, projectKey, epicKey, sortable }: Props = $props();

	const counted = $derived(tasks.filter((t) => !t.cancelledAt).length);
	const zone = $derived(`${stage}:${status}`);
	const isTarget = $derived(sortable.active !== null && sortable.over?.zone === zone);
	const dropBefore = $derived(isTarget ? sortable.over!.beforeId : undefined);
</script>

{#snippet dropLine()}
	<div class="-my-1 h-0.5 rounded-full bg-brand" aria-hidden="true"></div>
{/snippet}

<section
	class={cn(
		'flex min-h-48 flex-col gap-2 rounded-xl border border-transparent bg-sunken p-2 transition-colors duration-(--duration-fast)',
		isTarget && 'border-brand/40 bg-brand/5'
	)}
	aria-label="{STATUS_LABELS[status]}: {counted} tasks"
	{@attach sortable.zone(zone)}
>
	<header class="flex items-center gap-2 px-1.5 pt-1 text-xs font-medium">
		<StatusIcon {status} tone={status === 'todo' ? undefined : stageTone[stage]} size={13} />
		{STATUS_LABELS[status]}
		<span class="font-mono text-muted-foreground tabular-nums">{counted}</span>
	</header>
	{#each tasks as task (task.id)}
		{#if dropBefore === task.id}{@render dropLine()}{/if}
		<TaskCard
			{task}
			href={resolve('/projects/[project]/epics/[epic]/tasks/[task]', {
				project: projectKey,
				epic: epicKey,
				task: task.key
			})}
			class={cn(
				!task.cancelledAt &&
					'cursor-grab touch-manipulation select-none [-webkit-touch-callout:none]',
				sortable.active?.id === task.id && 'opacity-40'
			)}
			{@attach task.cancelledAt ? undefined : sortable.item(task.id, zone)}
		>
			{#snippet actions()}
				{#if !task.cancelledAt}<StageStatusMenu {task} {stage} />{/if}
			{/snippet}
		</TaskCard>
	{:else}
		<p
			class={cn(
				'grid flex-1 place-items-center rounded-lg border border-dashed p-4 text-xs text-muted-foreground',
				isTarget && 'border-brand/50 text-brand'
			)}
		>
			Drop tasks here
		</p>
	{/each}
	{#if tasks.length > 0 && dropBefore === null}{@render dropLine()}{/if}
</section>
