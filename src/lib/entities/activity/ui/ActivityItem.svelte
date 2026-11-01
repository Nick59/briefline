<script lang="ts">
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import BotIcon from '@lucide/svelte/icons/bot';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import RefreshIcon from '@lucide/svelte/icons/refresh-cw';
	import UserIcon from '@lucide/svelte/icons/user-round';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Activity } from '#lib/shared/domain/types.ts';
	import { RelativeTime } from '#lib/shared/ui/relative-time/index.ts';
	import { buttonVariants } from '#lib/shared/ui/primitives/button/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { isHumanActor } from '#lib/shared/domain/actors.ts';
	import { splitOnKey } from '#lib/shared/lib/ticket-key.ts';

	interface Props {
		activity: Activity;
		/** Shown in the meta row. */
		project?: { key: string; name: string };
	}

	let { activity, project }: Props = $props();

	const Icon = $derived(
		activity.actor === 'ticket-sync'
			? RefreshIcon
			: isHumanActor(activity.actor, page.data.profile?.name)
				? UserIcon
				: BotIcon
	);
	const ticketUrl = $derived(
		activity.ticket?.url && /^https?:\/\//i.test(activity.ticket.url) ? activity.ticket.url : null
	);
	const parts = $derived(
		ticketUrl && activity.ticket ? splitOnKey(activity.message, activity.ticket.key) : null
	);
	const target = $derived(activity.target);
	const isQuestion = $derived(activity.action.startsWith('question.'));
	const questionId = $derived(
		typeof activity.data.questionId === 'string' ? activity.data.questionId : null
	);
	const targetPath = $derived.by(() => {
		if (!target) return null;
		if (target.epicKey && target.taskKey)
			return resolve('/projects/[project]/epics/[epic]/tasks/[task]', {
				project: target.projectKey,
				epic: target.epicKey,
				task: target.taskKey
			});
		if (target.epicKey)
			return resolve('/projects/[project]/epics/[epic]', {
				project: target.projectKey,
				epic: target.epicKey
			});
		return resolve('/projects/[project]', { project: target.projectKey });
	});
	const targetLabel = $derived.by(() => {
		if (!target) return '';
		const ticketKey = activity.ticket?.key;
		if (target.epicKey && target.taskKey) return `Open task ${ticketKey ?? target.taskKey}`;
		if (target.epicKey) return `Open epic ${ticketKey ?? target.epicKey}`;
		return `Open project ${target.projectKey}`;
	});
	const targetHref = $derived(
		targetPath && isQuestion && questionId && activity.action !== 'question.deleted'
			? `${targetPath}?question=${encodeURIComponent(questionId)}`
			: targetPath
	);
	const questionHref = $derived(isQuestion && target?.epicKey ? targetHref : null);
	const showTarget = $derived(targetHref && targetPath !== page.url.pathname);
	const sessionHref = $derived(
		activity.sessionId && page.params.id !== activity.sessionId
			? resolve('/sessions/[id]', { id: activity.sessionId })
			: null
	);
	const failed = $derived(activity.action === 'ticket.sync_failed');
</script>

<li class="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] gap-3 py-3.5">
	<span
		class={cn(
			'mt-px grid size-7 place-items-center rounded-full bg-muted text-muted-foreground',
			failed && 'bg-danger/12 text-danger'
		)}
	>
		<Icon class="size-3.5" />
	</span>
	<div class="min-w-0 space-y-1.5 text-sm">
		<p class={cn('line-clamp-2 leading-snug text-pretty', failed && 'text-danger')}>
			{#if questionHref}
				<a href={questionHref} class="underline-offset-2 hover:underline">{activity.message}</a>
			{:else if parts && ticketUrl}
				{#each parts as part, i (i)}
					{#if part.isKey}
						<a
							href={ticketUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="font-mono underline-offset-2 hover:underline">{part.text}</a
						>
					{:else}{part.text}{/if}
				{/each}
			{:else}
				{activity.message}
			{/if}
		</p>
		{#if failed && typeof activity.data.error === 'string'}
			<p class="truncate font-mono text-[11px] text-muted-foreground" title={activity.data.error}>
				{activity.data.error}
			</p>
		{/if}
		{#if typeof activity.data.note === 'string'}
			<p class="border-l-2 pl-2 text-xs text-muted-foreground">{activity.data.note}</p>
		{/if}
		<p class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
			{#if project}
				<a
					href={resolve('/projects/[project]', { project: project.key })}
					title={project.name}
					class="font-mono underline-offset-2 hover:underline">{project.key}</a
				>
				<span aria-hidden="true">·</span>
			{/if}
			{#if questionHref && target?.epicKey}
				<a href={questionHref} class="font-mono underline-offset-2 hover:underline"
					>{activity.ticket?.key ?? target.epicKey}</a
				>
				<span aria-hidden="true">·</span>
			{/if}
			<span class="font-mono">{activity.actor}</span>
			<span aria-hidden="true">·</span>
			<RelativeTime value={activity.createdAt} />
			{#if ticketUrl && activity.ticket}
				<span aria-hidden="true">·</span>
				<a
					href={ticketUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
					title="Open {activity.ticket.key} in the ticket system"
					aria-label="Open {activity.ticket.key} in the ticket system"
					><ExternalLinkIcon class="size-3" /></a
				>
			{/if}
			{#if sessionHref}
				<span aria-hidden="true">·</span>
				<a href={sessionHref} class="underline-offset-2 hover:underline">Session</a>
			{/if}
		</p>
	</div>
	{#if showTarget}
		<a
			href={targetHref}
			title={targetLabel}
			aria-label={targetLabel}
			class={cn(
				buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
				'text-muted-foreground [@media(hover:hover)]:opacity-50 [@media(hover:hover)]:hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100'
			)}
		>
			<ArrowUpRightIcon />
		</a>
	{/if}
</li>
