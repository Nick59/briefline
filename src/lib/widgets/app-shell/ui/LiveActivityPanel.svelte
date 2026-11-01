<script lang="ts">
	import BellIcon from '@lucide/svelte/icons/bell';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useLiveActivity } from '#lib/shared/lib/live-activity/index.ts';
	import { liveLabel } from '#lib/shared/lib/live-activity/label.ts';
	import { relativeTime } from '#lib/shared/lib/format.ts';
	import { PRESENCE_SHOWN } from '#lib/shared/lib/live-activity/presence.ts';
	import { cn } from '#lib/shared/lib/utils.ts';

	let { onnavigate }: { onnavigate?: () => void } = $props();

	const live = useLiveActivity();
	const active = $derived(page.url.pathname.startsWith('/activity'));
	const dot = {
		online: 'bg-success',
		away: 'bg-warning',
		offline: 'bg-muted-foreground/40'
	} as const;

	const latest = $derived(live.recent[0]);
	const previous = $derived(live.recent.slice(1, 4));
	const shown = $derived(live.presence.slice(0, PRESENCE_SHOWN));
	const hidden = $derived(live.presence.length - shown.length);
	const ago = (iso: string) => relativeTime(iso, live.now);
</script>

<section
	class={cn(
		'relative rounded-lg border bg-card/60 p-2.5 text-xs transition-colors hover:bg-sidebar-accent has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-ring',
		active && 'bg-sidebar-accent'
	)}
	aria-label="Agent activity"
>
	<a
		href={resolve('/activity')}
		onclick={onnavigate}
		aria-label="Agent activity — open activity log"
		aria-current={active ? 'page' : undefined}
		class="absolute inset-0 z-0 rounded-lg focus-visible:outline-none"
	></a>
	<div class="flex items-center gap-2">
		<p class="min-w-0 flex-1 truncate font-medium">Agents</p>
		<button
			type="button"
			onclick={() => live.toggleMuted()}
			aria-pressed={live.muted}
			aria-label={live.muted ? 'Unmute notifications' : 'Mute notifications'}
			title={live.muted ? 'Notifications muted' : 'Mute notifications'}
			class="relative z-10 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
		>
			{#if live.muted}<BellOffIcon class="size-3.5" />{:else}<BellIcon class="size-3.5" />{/if}
		</button>
	</div>

	<div role="status" class="mt-1.5">
		{#if shown.length === 0}
			<p class="text-muted-foreground">No agent connected yet</p>
		{:else}
			<ul class="space-y-1">
				{#each shown as agent (agent.actor)}
					<li class="flex items-center gap-2">
						<span class="relative flex size-2 shrink-0" aria-hidden="true">
							{#if agent.status === 'online' && live.status === 'active' && agent.actor === latest?.actor}
								<span
									class="absolute inline-flex size-full animate-ping rounded-full bg-success/70 motion-reduce:animate-none"
								></span>
							{/if}
							<span class={cn('relative inline-flex size-2 rounded-full', dot[agent.status])}
							></span>
						</span>
						<span class="min-w-0 flex-1 truncate font-medium">{agent.actor}</span>
						<span
							class={cn(
								'shrink-0 text-[11px]',
								agent.status === 'online' ? 'text-foreground' : 'text-muted-foreground'
							)}>{agent.text}</span
						>
					</li>
				{/each}
			</ul>
			{#if hidden > 0}
				<p class="mt-1 text-[11px] text-muted-foreground">+{hidden} more</p>
			{/if}
		{/if}
		{#if live.connected === 'closed'}
			<p class="mt-1 text-[11px] text-muted-foreground">Live updates disconnected</p>
		{/if}
	</div>

	{#if latest}
		<p class="mt-1 text-muted-foreground">
			<span class="line-clamp-2">{latest.actor} · {liveLabel(latest)}</span>
			<span class="tabular-nums">{ago(latest.at)}</span>
		</p>
		{#if previous.length}
			<ul class="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground/80">
				{#each previous as event (event.at + event.type + event.key)}
					<li class="truncate">{event.actor} · {liveLabel(event)}</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>
