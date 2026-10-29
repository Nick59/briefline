<script lang="ts">
	import * as Tabs from '#lib/shared/ui/primitives/tabs/index.js';
	import {
		STAGES,
		STAGE_LABELS,
		STATUS_LABELS,
		WORK_STATUSES,
		type Stage,
		type WorkStatus
	} from '#lib/shared/domain/constants.ts';
	import type { EpicDetail, Task } from '#lib/shared/domain/types.ts';
	import { stageTone, toneClasses } from '#lib/shared/config/tokens/index.ts';
	import { Sortable, type DropEvent } from '#lib/shared/lib/dnd/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { StageIcon } from '#lib/entities/work-status/index.ts';
	import BoardColumn from './BoardColumn.svelte';

	let { epic, stage = $bindable('dev') }: { epic: EpicDetail; stage?: Stage } = $props();

	interface PendingMove {
		taskId: string;
		stage: Stage;
		status: WorkStatus;
		beforeId: string | null;
	}

	/** The last drop, shown right away and replaced by server data once it is saved. */
	let pending = $state<PendingMove | null>(null);

	const tasks = $derived.by(() => {
		if (!pending) return epic.tasks;
		const { taskId, beforeId } = pending;
		const moved = epic.tasks.find((t) => t.id === taskId);
		if (!moved) return epic.tasks;
		const updated: Task = {
			...moved,
			stages: { ...moved.stages, [pending.stage]: pending.status }
		};
		const rest = epic.tasks.filter((t) => t.id !== taskId);
		const index = beforeId ? rest.findIndex((t) => t.id === beforeId) : -1;
		rest.splice(index === -1 ? rest.length : index, 0, updated);
		return rest;
	});

	const phaseNames = $derived(new Map(epic.phases.map((p) => [p.id, p.name])));

	const columns = (s: Stage) =>
		WORK_STATUSES.map((status) => ({ status, tasks: tasks.filter((t) => t.stages[s] === status) }));

	async function drop({ id, zone, beforeId }: DropEvent) {
		const [s, status] = zone.split(':') as [Stage, WorkStatus];
		const task = tasks.find((t) => t.id === id);
		if (!task) return;
		const statusChanged = task.stages[s] !== status;
		const column = tasks.filter((t) => t.stages[s] === status && t.id !== id);
		const currentNext = column[column.findIndex((t) => t.position > task.position)]?.id ?? null;
		if (!statusChanged && beforeId === currentNext) return;

		pending = { taskId: id, stage: s, status, beforeId };
		// Place it before the next card of the column, or after the column's last card.
		const beforeTask = beforeId ?? nextAfterColumn(s, status, id);
		await runOperation(
			'move_task',
			{ task: id, beforeTask, ...(statusChanged ? { stage: s, status } : {}) },
			{ success: statusChanged ? `${STAGE_LABELS[s]} → ${STATUS_LABELS[status]}` : undefined }
		);
		pending = null;
	}

	/** The task right after the column's last card in the epic order, so "end of column" stays put. */
	function nextAfterColumn(s: Stage, status: WorkStatus, movingId: string): string | null {
		const order = epic.tasks.filter((t) => t.id !== movingId);
		const last = order.findLastIndex((t) => t.stages[s] === status);
		return last === -1 ? null : (order[last + 1]?.id ?? null);
	}

	const sortable = new Sortable({ ondrop: drop });
</script>

<Tabs.Root bind:value={stage} class="gap-4">
	<Tabs.List class="h-auto w-full justify-start gap-1 bg-transparent p-0 sm:w-auto">
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
	</Tabs.List>
	{#each STAGES as s (s)}
		<Tabs.Content value={s}>
			<div class="grid gap-3 lg:grid-cols-3">
				{#each columns(s) as column (column.status)}
					<BoardColumn
						stage={s}
						status={column.status}
						tasks={column.tasks}
						{phaseNames}
						projectKey={epic.project.key}
						epicKey={epic.key}
						{sortable}
					/>
				{/each}
			</div>
		</Tabs.Content>
	{/each}
</Tabs.Root>
<p class="mt-2 text-xs text-muted-foreground">
	Drag cards to move or reorder them (long-press on touch screens), or use the ··· menu on a card.
</p>
