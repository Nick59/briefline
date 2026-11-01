<script lang="ts">
	import { displayKey, displayKeyTitle } from '#lib/shared/domain/display-key.ts';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import UserIcon from '@lucide/svelte/icons/user-round';
	import type { Task } from '#lib/shared/domain/types.ts';
	import { KeyChip } from '#lib/shared/ui/key-chip/index.ts';
	import { taskTintClass } from '#lib/shared/config/tokens/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { useLiveActivity } from '#lib/shared/lib/live-activity/index.ts';
	import PriorityBadge from './PriorityBadge.svelte';
	import TaskStageStrip from './TaskStageStrip.svelte';

	interface Props extends HTMLAttributes<HTMLElement> {
		task: Task;
		href: string;
		actions?: Snippet;
	}

	let { task, href, actions, class: className, ...rest }: Props = $props();
	const live = useLiveActivity();
</script>

<article
	class={cn(
		'group relative rounded-lg border bg-card p-3 shadow-xs transition-[border-color,box-shadow,background-color] duration-(--duration-fast) hover:border-foreground/20 hover:shadow-sm',
		taskTintClass(task.stages),
		live?.isChanged(task.key) &&
			'bg-brand/15 duration-1500 motion-reduce:transition-none',
		className
	)}
	{...rest}
>
	<div class="mb-1.5 flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<KeyChip value={displayKey(task)} title={displayKeyTitle(task)} />
			<TaskStageStrip stages={task.stages} size={12} />
		</div>
		{#if actions}
			<div class="relative z-10 flex items-center">{@render actions()}</div>
		{/if}
	</div>
	<h3 class="text-sm leading-snug font-medium text-pretty">
		<a
			{href}
			draggable="false"
			class="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
		>
			{task.title}
		</a>
	</h3>
	{#if task.summary}
		<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.summary}</p>
	{/if}
	<div class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
		<PriorityBadge priority={task.priority} />
		{#if task.assignee}
			<span class="inline-flex items-center gap-1"><UserIcon class="size-3" />{task.assignee}</span>
		{/if}
		{#if task.commentCount > 0}
			<span
				class="inline-flex items-center gap-1"
				title="{task.commentCount} {task.commentCount === 1 ? 'comment' : 'comments'}"
			>
				<MessageSquareIcon class="size-3" />{task.commentCount}
			</span>
		{/if}
	</div>
</article>
