<script lang="ts">
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { useEpicOrder } from '#lib/shared/lib/epic-order/index.svelte.ts';
	import { resolve } from '$app/paths';
	import type { EpicSummary, Task } from '#lib/shared/domain/types.ts';
	import { Sortable, type DropEvent } from '#lib/shared/lib/dnd/index.ts';
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import TimelineEpic from './TimelineEpic.svelte';

	let { epics, projectKey }: { epics: (EpicSummary & { tasks: Task[] })[]; projectKey: string } =
		$props();
	const epicOrder = useEpicOrder(() => projectKey);
	const taskSortable = new Sortable({
		ondrop: async ({ id, zone, beforeId }) => {
			await runOperation(
				'move_task',
				{ task: id, epic: zone, beforeTask: beforeId },
				{ success: 'Task moved' }
			);
		}
	});
	const zone = 'project-epics';
	const sortable = new Sortable({ ondrop: drop });
	const dropBefore = $derived(sortable.over?.zone === zone ? sortable.over.beforeId : undefined);
	function drop(event: DropEvent) {
		const next = ordered.map((epic) => epic.id).filter((id) => id !== event.id);
		const index = event.beforeId === null ? next.length : next.indexOf(event.beforeId);
		if (index < 0) return;
		next.splice(index, 0, event.id);
		persist(next);
	}
	const ordered = $derived(epicOrder.sort(epics));
	const persist = (ids: string[]) => epicOrder.save(ids);
	function move(id: string, target: string) {
		const next = ordered.map((epic) => epic.id);
		const from = next.indexOf(id),
			to = next.indexOf(target);
		if (from < 0 || to < 0 || from === to) return;
		next.splice(from, 1);
		next.splice(to, 0, id);
		persist(next);
	}
</script>

<div {@attach sortable.zone(zone)}>
	{#each ordered as epic, index (epic.id)}
		{#if dropBefore === epic.id}<div
				class="h-0.5 rounded-full bg-brand"
				aria-hidden="true"
			></div>{/if}
		<div
			role="group"
			aria-label={epic.title}
			data-epic-id={epic.id}
			{@attach sortable.item(epic.id, zone)}
			class="relative rounded-md bg-background pl-8 {sortable.active?.id === epic.id
				? 'opacity-40'
				: ''}"
		>
			<div class="absolute top-1 left-0 flex flex-col">
				<span
					class="cursor-grab touch-manipulation px-1 text-muted-foreground select-none [-webkit-touch-callout:none]"
					title="Drag to reorder"
					aria-hidden="true"><GripVerticalIcon class="size-4" /></span
				>
				<button
					class="cursor-grab px-1 text-xs text-muted-foreground disabled:opacity-25"
					aria-label="Move {epic.title} up"
					disabled={index === 0}
					onclick={() => move(epic.id, ordered[index - 1].id)}>↑</button
				>
				<button
					class="cursor-grab px-1 text-xs text-muted-foreground disabled:opacity-25"
					aria-label="Move {epic.title} down"
					disabled={index === ordered.length - 1}
					onclick={() => move(epic.id, ordered[index + 1].id)}>↓</button
				>
			</div>
			<ol>
				<TimelineEpic
					{epic}
					{taskSortable}
					{index}
					{projectKey}
					isLast={index === ordered.length - 1}
					href={resolve('/projects/[project]/epics/[epic]', {
						project: projectKey,
						epic: epic.key
					})}
				/>
			</ol>
		</div>
	{/each}
	{#if dropBefore === null}<div class="h-0.5 rounded-full bg-brand" aria-hidden="true"></div>{/if}
</div>
