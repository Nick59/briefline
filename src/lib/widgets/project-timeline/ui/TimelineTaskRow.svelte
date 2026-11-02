<script lang="ts">
	import { displayKey, displayKeyTitle } from '#lib/shared/domain/display-key.ts';
	import type { Sortable } from '#lib/shared/lib/dnd/index.ts';
	import type { Task } from '#lib/shared/domain/types.ts';
	import { taskTintClass } from '#lib/shared/config/tokens/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';
	import { KeyChip } from '#lib/shared/ui/key-chip/index.ts';
	import { TaskStageStrip } from '#lib/entities/task/index.ts';

	let {
		task,
		href,
		sortable,
		zone = ''
	}: { task: Task; href: string; sortable?: Sortable; zone?: string } = $props();
</script>

<li
	{@attach sortable && !task.cancelledAt ? sortable.item(task.id, zone) : () => {}}
	class={sortable && !task.cancelledAt
		? `cursor-grab touch-manipulation ${sortable.active?.id === task.id ? 'opacity-40' : ''}`
		: ''}
>
	<a
		{href}
		class={cn(
			'grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
			taskTintClass(task.stages),
			task.cancelledAt && 'opacity-60'
		)}
	>
		<KeyChip value={displayKey(task)} title={displayKeyTitle(task)} />
		<span class={cn('truncate', task.cancelledAt && 'line-through')}>{task.title}</span>
		{#if task.cancelledAt}
			<ToneBadge tone="neutral">Cancelled</ToneBadge>
		{:else}
			<TaskStageStrip stages={task.stages} size={12} />
		{/if}
	</a>
</li>
