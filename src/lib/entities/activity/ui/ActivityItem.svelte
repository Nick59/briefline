<script lang="ts">
	import BotIcon from '@lucide/svelte/icons/bot';
	import RefreshIcon from '@lucide/svelte/icons/refresh-cw';
	import UserIcon from '@lucide/svelte/icons/user-round';
	import type { Activity } from '#lib/shared/domain/types.ts';
	import { RelativeTime } from '#lib/shared/ui/relative-time/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { splitOnKey } from '#lib/shared/lib/ticket-key.ts';

	let { activity }: { activity: Activity } = $props();

	const HUMAN_ACTORS = new Set(['dashboard', 'seed']);
	const Icon = $derived(
		activity.actor === 'ticket-sync'
			? RefreshIcon
			: HUMAN_ACTORS.has(activity.actor)
				? UserIcon
				: BotIcon
	);
	const ticketUrl = $derived(
		activity.ticket?.url && /^https?:\/\//i.test(activity.ticket.url) ? activity.ticket.url : null
	);
	const parts = $derived(
		ticketUrl && activity.ticket ? splitOnKey(activity.message, activity.ticket.key) : null
	);
	const failed = $derived(activity.action === 'ticket.sync_failed');
</script>

<li class="grid grid-cols-[1.5rem_1fr] gap-2 py-2">
	<span
		class={cn(
			'mt-0.5 grid size-6 place-items-center rounded-full bg-muted text-muted-foreground',
			failed && 'bg-danger/12 text-danger'
		)}
	>
		<Icon class="size-3" />
	</span>
	<div class="min-w-0 text-sm">
		<p class={cn('text-pretty', failed && 'text-danger')}>
			{#if parts && ticketUrl}
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
			<p class="mt-0.5 border-l-2 pl-2 text-xs text-muted-foreground">{activity.data.note}</p>
		{/if}
		<p class="text-[11px] text-muted-foreground">
			<span class="font-mono">{activity.actor}</span> · <RelativeTime value={activity.createdAt} />
		</p>
	</div>
</li>
