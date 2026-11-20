<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import BanIcon from '@lucide/svelte/icons/ban';
	import * as Tabs from '#lib/shared/ui/primitives/tabs/index.js';
	import {
		STAGES,
		STAGE_LABELS,
		STATUS_LABELS,
		WORK_STATUSES,
		type Stage,
		type WorkStatus
	} from '#lib/shared/domain/constants.ts';
	import type { EpicDetail } from '#lib/shared/domain/types.ts';
	import { stageTone, toneClasses } from '#lib/shared/config/tokens/index.ts';
	import { Sortable, type DropEvent } from '#lib/shared/lib/dnd/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { StageIcon } from '#lib/entities/work-status/index.ts';
	import { TaskCard } from '#lib/entities/task/index.ts';
	import { applyDrop, byPosition, planDrop, type DropPlan } from '../model/drop.ts';
	import { initialStage } from '../model/initial-stage.ts';
	import BoardColumn from './BoardColumn.svelte';

	let {
		epic,
		stage = $bindable(untrack(() => initialStage(epic.progress)))
	}: { epic: EpicDetail; stage?: Stage | 'cancelled' } = $props();

	const locked = $derived((epic.specsRequired && !epic.specsApprovedAt) || epic.openQuestions > 0);

	/** The last drop, shown right away and replaced by server data once it is saved. */
	let pending = $state<{ taskId: string; stage: Stage; plan: DropPlan } | null>(null);

	const tasks = $derived(
		pending
			? applyDrop(epic.tasks, pending.taskId, pending.stage, pending.plan)
			: byPosition(epic.tasks)
	);

	const cancelled = $derived(tasks.filter((t) => t.cancelledAt));

	const columns = (s: Stage) =>
		WORK_STATUSES.map((status) => ({
			status,
			tasks: tasks.filter((t) => !t.cancelledAt && t.stages[s] === status)
		}));

	$effect(() => {
		if (stage === 'cancelled' && cancelled.length === 0) stage = initialStage(epic.progress);
	});

	async function drop({ id, zone, beforeId }: DropEvent) {
		if (locked) return;
		const [s, status] = zone.split(':') as [Stage, WorkStatus];
		const plan = planDrop(tasks, id, s, status, beforeId);
		if (!plan) return;
		const dragged = tasks.find((t) => t.id === id);
		if (dragged?.blockedAt && plan.status) {
			toast.error(
				`${dragged.key} is blocked${dragged.blockReason ? `: ${dragged.blockReason}` : ''}. Unblock it before moving it.`
			);
			return;
		}

		pending = { taskId: id, stage: s, plan };
		await runOperation(
			'move_task',
			plan.status
				? { task: id, stage: s, status: plan.status }
				: { task: id, beforeTask: plan.beforeTask },
			{ success: plan.status ? `${STAGE_LABELS[s]} → ${STATUS_LABELS[status]}` : undefined }
		);
		pending = null;
	}

	const sortable = new Sortable({ ondrop: drop });
</script>

<Tabs.Root bind:value={stage} class="gap-4">
	<Tabs.List class="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 sm:w-auto">
		{#each STAGES as s (s)}
			{@const counts = epic.progress.stages[s]}
			<Tabs.Trigger
				value={s}
				class="h-auto flex-none gap-2 rounded-lg border border-transparent px-3 py-2 data-active:border-border data-active:bg-card data-active:shadow-xs"
			>
				<StageIcon stage={s} />
				<span class="font-medium">{STAGE_LABELS[s]}</span>
				<span class={cn('font-mono text-[11px] tabular-nums', toneClasses[stageTone[s]].text)}>
					{counts.done}/{counts.total}
				</span>
			</Tabs.Trigger>
		{/each}
		{#if cancelled.length > 0}
			<Tabs.Trigger
				value="cancelled"
				class="h-auto flex-none gap-2 rounded-lg border border-transparent px-3 py-2 data-active:border-border data-active:bg-card data-active:shadow-xs"
			>
				<BanIcon class="size-4" />
				<span class="font-medium">Cancelled</span>
				<span class="font-mono text-[11px] text-muted-foreground tabular-nums">
					{cancelled.length}
				</span>
			</Tabs.Trigger>
		{/if}
	</Tabs.List>
	{#each STAGES as s (s)}
		<Tabs.Content value={s}>
			<div class="grid gap-3 lg:grid-cols-3">
				{#each columns(s) as column (column.status)}
					<BoardColumn
						{locked}
						stage={s}
						status={column.status}
						tasks={column.tasks}
						projectKey={epic.project.key}
						epicKey={epic.key}
						{sortable}
					/>
				{/each}
			</div>
		</Tabs.Content>
	{/each}
	<Tabs.Content value="cancelled">
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each cancelled as task (task.id)}
				<TaskCard
					{task}
					href={resolve('/projects/[project]/epics/[epic]/tasks/[task]', {
						project: epic.project.key,
						epic: epic.key,
						task: task.key
					})}
				/>
			{/each}
		</div>
	</Tabs.Content>
</Tabs.Root>
<p class="mt-2 text-xs text-muted-foreground">
	{#if locked}
		Dragging is disabled until specs are approved and open threads are resolved.
	{:else}
		Drag cards to move or reorder them (long-press on touch screens), or use the ··· menu on a card.
	{/if}
</p>
