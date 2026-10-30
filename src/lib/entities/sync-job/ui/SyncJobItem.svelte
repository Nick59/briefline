<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SyncJob } from '#lib/shared/domain/types.ts';
	import type { Tone } from '#lib/shared/config/tokens/index.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';
	import { RelativeTime } from '#lib/shared/ui/relative-time/index.ts';

	let { job, actions }: { job: SyncJob; actions?: Snippet } = $props();

	const tones: Record<SyncJob['status'], Tone> = {
		pending: 'status-in-progress',
		succeeded: 'success',
		failed: 'danger',
		skipped: 'neutral'
	};
	const ref = $derived((job.payload.ref ?? {}) as { key?: string });
	const update = $derived((job.payload.update ?? {}) as { status?: string; progress?: number });
</script>

<li class="flex items-start justify-between gap-3 py-2 text-sm">
	<div class="min-w-0 space-y-0.5">
		<p class="flex items-center gap-2">
			<ToneBadge tone={tones[job.status]}>{job.status}</ToneBadge>
			<span class="font-mono text-xs">{ref.key}</span>
			<span class="text-xs text-muted-foreground">{job.provider}</span>
		</p>
		<p class="text-[11px] text-muted-foreground">
			{update.status?.replace('_', ' ')} · {update.progress ?? 0}% · <RelativeTime
				value={job.updatedAt}
			/>
			{#if job.attempts > 1}· {job.attempts} attempts{/if}
		</p>
		{#if job.message}
			<p class="text-[11px] text-warning">{job.message}</p>
		{/if}
		{#if job.lastError}
			<p class="truncate font-mono text-[11px] text-danger" title={job.lastError}>
				{job.lastError}
			</p>
		{/if}
	</div>
	{#if actions}{@render actions()}{/if}
</li>
