<script lang="ts">
	import type { Activity } from '#lib/shared/domain/types.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { ActivityItem } from '#lib/entities/activity/index.ts';

	let { items, title = 'Activity' }: { items: Activity[]; title?: string } = $props();
</script>

<Section {title}>
	{#if items.length === 0}
		<p class="text-sm text-muted-foreground">Nothing has happened yet.</p>
	{:else}
		<ol class="divide-y">
			{#each items as activity (activity.id)}
				<ActivityItem {activity} />
			{/each}
		</ol>
	{/if}
</Section>
