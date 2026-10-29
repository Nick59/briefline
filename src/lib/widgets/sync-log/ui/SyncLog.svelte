<script lang="ts">
	import type { SyncJob } from '#lib/shared/domain/types.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { SyncJobItem } from '#lib/entities/sync-job/index.ts';
	import { RetrySyncButton } from '#lib/features/sync-ticket/index.ts';

	let { jobs }: { jobs: SyncJob[] } = $props();
</script>

<Section title="Ticket sync">
	{#if jobs.length === 0}
		<p class="text-sm text-muted-foreground">No ticket updates sent yet.</p>
	{:else}
		<ol class="divide-y">
			{#each jobs as job (job.id)}
				<SyncJobItem {job}>
					{#snippet actions()}
						{#if job.status === 'failed'}<RetrySyncButton jobId={job.id} />{/if}
					{/snippet}
				</SyncJobItem>
			{/each}
		</ol>
	{/if}
</Section>
