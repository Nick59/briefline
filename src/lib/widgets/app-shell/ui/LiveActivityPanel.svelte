<script lang="ts">
	import BellIcon from '@lucide/svelte/icons/bell';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';
	import { resolve } from '$app/paths';
	import { useLiveActivity } from '#lib/shared/lib/live-activity/index.ts';
	import { relativeTime } from '#lib/shared/lib/format.ts';
	import { cn } from '#lib/shared/lib/utils.ts';

	let { projectKey, onnavigate }: { projectKey: string; onnavigate?: () => void } = $props();

	const live = useLiveActivity();
	const labels = { active: 'working', recent: 'recent', idle: 'idle', offline: 'offline' } as const;
	const dot = {
		active: 'bg-emerald-500',
		recent: 'bg-amber-500',
		idle: 'bg-muted-foreground/40',
		offline: 'bg-red-500'
	} as const;

	const latest = $derived(live.recent[0]);
	const previous = $derived(live.recent.slice(1, 4));
	const ago = (iso: string) => relativeTime(iso, live.now);
</script>

<section class="rounded-lg border bg-card/60 p-2.5 text-xs" aria-label="Claude activity">
	<div class="flex items-center gap-2">
		<span class="relative flex size-2.5 shrink-0" aria-hidden="true">
			{#if live.status === 'active'}
				<span
					class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/70 motion-reduce:animate-none"
				></span>
			{/if}
			<span class={cn('relative inline-flex size-2.5 rounded-full', dot[live.status])}></span>
		</span>
		<p class="min-w-0 flex-1 truncate font-medium" role="status">
			Claude · {labels[live.status]}{#if live.status === 'idle'}
				<span class="font-normal text-muted-foreground">
					· {latest ? `last action ${ago(latest.at)}` : 'no activity yet'}</span
				>{/if}
		</p>
		<button
			type="button"
			onclick={() => live.toggleMuted()}
			aria-pressed={live.muted}
			aria-label={live.muted ? 'Unmute notifications' : 'Mute notifications'}
			title={live.muted ? 'Notifications muted' : 'Mute notifications'}
			class="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
		>
			{#if live.muted}<BellOffIcon class="size-3.5" />{:else}<BellIcon class="size-3.5" />{/if}
		</button>
	</div>

	{#if live.status !== 'idle' && live.status !== 'offline' && latest}
		{#if live.focus}
			<div class="mt-2 min-w-0">
				<p class="text-[10px] tracking-wider text-muted-foreground uppercase">Working on</p>
				<a
					href={live.focus.epicId && live.focus.taskId
						? resolve('/projects/[project]/epics/[epic]/tasks/[task]', {
								project: projectKey,
								epic: live.focus.epicId,
								task: live.focus.key ?? live.focus.taskId
							})
						: resolve('/projects/[project]', { project: projectKey })}
					onclick={onnavigate}
					class="block truncate font-medium hover:underline"
				>
					<span class="font-mono">{live.focus.key}</span>
					{live.focus.title}
				</a>
			</div>
		{/if}
		<p class="mt-1 text-muted-foreground">
			<span class="line-clamp-2">{latest.message}</span>
			<span class="tabular-nums">{ago(latest.at)}</span>
		</p>
		{#if previous.length}
			<ul class="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground/80">
				{#each previous as event (event.at + event.type + event.key)}
					<li class="truncate" title={event.message}>{event.message}</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>
