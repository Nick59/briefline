<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import CheckCheckIcon from '@lucide/svelte/icons/check-check';
	import { resolve } from '$app/paths';
	import { ActivityItem } from '#lib/entities/activity/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.ts';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import { RelativeTime } from '#lib/shared/ui/relative-time/index.ts';
	import type { InboxItem } from '#lib/shared/domain/types.ts';

	let { items }: { items: InboxItem[] } = $props();

	let busy = $state<string | null>(null);

	async function markSeen(key: string) {
		busy = key;
		await runOperation('mark_inbox_seen', { items: [key] }, { success: `Marked ${key} seen` });
		busy = null;
	}

	async function markAllSeen() {
		busy = 'all';
		await runOperation(
			'mark_inbox_seen',
			{ items: items.map((item) => item.key) },
			{ success: 'Marked everything seen' }
		);
		busy = null;
	}
</script>

<div class="max-w-4xl space-y-6">
	<PageHeader title="Inbox">
		{#snippet description()}
			Changes agents made to tasks and threads since you last looked.
		{/snippet}
		{#snippet actions()}
			{#if items.length > 0}
				<Button variant="outline" disabled={busy !== null} onclick={markAllSeen}
					><CheckCheckIcon />See all</Button
				>
			{/if}
		{/snippet}
	</PageHeader>

	{#if items.length === 0}
		<EmptyState
			title="You're up to date"
			description="Tasks and threads appear here when an agent changes them."
		/>
	{:else}
		<ul class="grid gap-4">
			{#each items as item (item.key)}
				<li class="space-y-3 rounded-lg border p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<a
								class="font-medium hover:underline"
								href={item.kind === 'epic'
									? resolve('/projects/[project]/epics/[epic]', {
											project: item.projectKey,
											epic: item.epicKey
										})
									: resolve('/projects/[project]/epics/[epic]/tasks/[task]', {
											project: item.projectKey,
											epic: item.epicKey,
											task: item.key
										})}
							>
								<span class="font-mono text-sm text-muted-foreground">{item.key}</span>
								{item.title}
							</a>
							<p class="text-xs text-muted-foreground">
								Flagged <RelativeTime value={item.flaggedAt} />
							</p>
							{#if item.ackedBy.length}
								<p class="mt-1 flex flex-wrap gap-1.5">
									{#each item.ackedBy as ack (ack.agent)}
										<ToneBadge tone={ack.upToDate ? 'success' : 'neutral'}>
											{ack.agent}{ack.upToDate ? '' : ' (behind)'}
										</ToneBadge>
									{/each}
								</p>
							{/if}
						</div>
						<div class="flex shrink-0 gap-2">
							<Button size="sm" disabled={busy === item.key} onclick={() => markSeen(item.key)}
								><CheckIcon />Mark seen</Button
							>
						</div>
					</div>
					<ol class="divide-y divide-border/70 rounded-xl border bg-card px-4">
						{#each item.changes as change (change.id)}
							<ActivityItem activity={change} />
						{/each}
					</ol>
				</li>
			{/each}
		</ul>
	{/if}
</div>
