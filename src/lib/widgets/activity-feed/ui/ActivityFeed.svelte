<script lang="ts">
	import { page as current } from '$app/state';
	import type { Activity } from '#lib/shared/domain/types.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.ts';
	import { ActivityItem } from '#lib/entities/activity/index.ts';

	interface Props {
		items: Activity[];
		page: number;
		pageCount: number;
		title?: string;
		param?: string;
	}

	let { items, page, pageCount, title = 'Activity', param = 'activity' }: Props = $props();

	const pageHref = (target: number) => {
		const url = new URL(current.url.href);
		if (target <= 1) url.searchParams.delete(param);
		else url.searchParams.set(param, String(target));
		return `${url.pathname}${url.search}`;
	};
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
		{#if pageCount > 1}
			<nav class="mt-3 flex items-center justify-between gap-2" aria-label="{title} pages">
				<Button
					variant="outline"
					size="sm"
					href={pageHref(page - 1)}
					disabled={page <= 1}
					data-sveltekit-noscroll
					data-sveltekit-keepfocus
				>
					Previous
				</Button>
				<span class="text-sm text-muted-foreground">Page {page} of {pageCount}</span>
				<Button
					variant="outline"
					size="sm"
					href={pageHref(page + 1)}
					disabled={page >= pageCount}
					data-sveltekit-noscroll
					data-sveltekit-keepfocus
				>
					Next
				</Button>
			</nav>
		{/if}
	{/if}
</Section>
