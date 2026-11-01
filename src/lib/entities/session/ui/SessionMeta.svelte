<script lang="ts">
	import BotIcon from '@lucide/svelte/icons/bot';
	import { resolve } from '$app/paths';
	import type { SessionSummary } from '#lib/shared/domain/types.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';
	import { durationLabel, isSessionActive, recapChips } from '../lib/session-view.ts';

	interface Props {
		session: SessionSummary;
		now?: number;
	}

	let { session, now = Date.now() }: Props = $props();

	const clock = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });
	const active = $derived(isSessionActive(session, now));
	const chips = $derived(recapChips(session.recap));
	const end = $derived(session.endedAt ?? session.lastSeenAt);
</script>

<div class="space-y-2 text-sm">
	<p class="flex flex-wrap items-center gap-x-2 gap-y-1">
		<BotIcon class="size-4 text-muted-foreground" />
		<span class="font-medium">{session.actor}</span>
		{#if session.clientName}
			<span class="text-muted-foreground">
				{session.clientName}{session.clientVersion ? ` ${session.clientVersion}` : ''}
			</span>
		{/if}
		{#if active}
			<ToneBadge tone="success" variant="dot">active</ToneBadge>
		{/if}
	</p>
	<p class="text-xs text-muted-foreground">
		{clock.format(new Date(session.startedAt))} – {active ? 'now' : clock.format(new Date(end))}
		{#if !active}
			<span aria-hidden="true">·</span> {durationLabel(session.startedAt, end)}
		{/if}
		<span aria-hidden="true">·</span>
		{session.activityCount}
		{session.activityCount === 1 ? 'change' : 'changes'}
	</p>
	{#if session.projects.length}
		<p class="flex flex-wrap items-center gap-1.5 text-xs">
			{#each session.projects as project (project.id)}
				<a
					href={resolve('/projects/[project]', { project: project.key })}
					title={project.name}
					class="relative z-10 rounded bg-muted px-1.5 py-0.5 font-mono underline-offset-2 hover:underline"
					>{project.key}</a
				>
			{/each}
		</p>
	{/if}
	{#if chips.length}
		<p class="flex flex-wrap gap-1.5">
			{#each chips as chip (chip)}
				<ToneBadge tone="neutral">{chip}</ToneBadge>
			{/each}
		</p>
	{/if}
</div>
