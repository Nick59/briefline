<script lang="ts">
	import { untrack } from 'svelte';
	import type { Activity, PageView } from '#lib/shared/domain/types.ts';
	import { useLiveActivity } from '#lib/shared/lib/live-activity/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.ts';
	import { ActivityItem } from '#lib/entities/activity/index.ts';

	interface Props {
		/** The first page, from the page load. */
		items: Activity[];
		page: number;
		pageCount: number;
		total: number;
		pageSize: number;
		/** Selects what the pages list: project, epic, task, or the activity filters. Empty means everything. */
		query?: Record<string, string>;
		title?: string;
		empty?: string;
		/** Shows each entry's project; keyed by project id. */
		projects?: Record<string, { key: string; name: string }>;
		/** Called after the reader moved to another page. */
		onpagechange?: (page: number) => void;
	}

	let {
		items,
		page,
		pageCount,
		total,
		pageSize,
		query = {},
		title = 'Activity',
		empty = 'Nothing has happened yet.',
		projects,
		onpagechange
	}: Props = $props();

	const live = useLiveActivity();

	let fetched = $state<PageView<Activity> | null>(null);
	let busy = $state(false);
	let failed = $state<number | null>(null);
	let request = 0;

	const view = $derived<PageView<Activity>>(fetched ?? { items, page, pageCount, total, pageSize });
	const first = $derived((view.page - 1) * view.pageSize + 1);
	const last = $derived((view.page - 1) * view.pageSize + view.items.length);

	async function load(target: number, quiet = false) {
		const id = ++request;
		if (!quiet) failed = null;
		busy = true;
		try {
			const params = new URLSearchParams({
				...query,
				page: String(target),
				size: String(pageSize)
			});
			const response = await fetch(`/activity/page?${params}`, {
				headers: { accept: 'application/json' }
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const next = (await response.json()) as PageView<Activity>;
			if (id !== request) return;
			const moved = next.page !== view.page;
			fetched = next;
			failed = null;
			if (moved) onpagechange?.(next.page);
		} catch (error) {
			if (id !== request) return;
			console.error('[activity] could not load page', error);
			if (!quiet) failed = target;
		} finally {
			if (id === request) busy = false;
		}
	}

	// A new page load carries the latest first page; a later page the reader chose is fetched again.
	let scope = untrack(() => JSON.stringify(query));
	$effect(() => {
		void items;
		const next = JSON.stringify(query);
		untrack(() => {
			const current = fetched;
			if (current && current.page > 1 && next === scope) void load(current.page, true);
			else {
				request++;
				busy = false;
				fetched = null;
			}
			scope = next;
		});
	});

	// A later page must stay put while new entries arrive; page 1 follows the log.
	$effect(() => {
		live.holdRefresh = view.page > 1;
		return () => (live.holdRefresh = false);
	});

	$effect(() => {
		if (view.page <= 1) return;
		return live.onHeldRefresh(() => void load(view.page, true));
	});
</script>

<Section {title}>
	<div aria-busy={busy} class={busy ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
		{#if view.items.length === 0}
			<p class="text-sm text-muted-foreground">{empty}</p>
		{:else}
			<ol class="divide-y divide-border/70 rounded-xl border bg-card px-4">
				{#each view.items as activity (activity.id)}
					<ActivityItem {activity} project={projects?.[activity.projectId]} />
				{/each}
			</ol>
			<div class="mt-5 flex flex-col gap-3">
				<p class="text-sm text-muted-foreground" data-testid="activity-range">
					Showing {first}–{last} of {view.total}
				</p>
				{#if view.pageCount > 1}
					<nav
						class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
						aria-label="{title} pages"
					>
						<Button
							variant="outline"
							size="sm"
							type="button"
							disabled={view.page <= 1 || busy}
							onclick={() => load(view.page - 1)}
						>
							Previous
						</Button>
						<span class="text-sm text-muted-foreground">Page {view.page} of {view.pageCount}</span>
						<Button
							variant="outline"
							size="sm"
							type="button"
							disabled={view.page >= view.pageCount || busy}
							onclick={() => load(view.page + 1)}
						>
							Next
						</Button>
					</nav>
				{/if}
				{#if failed !== null}
					<p class="flex items-center gap-2 text-sm text-destructive" role="alert">
						Could not load that page.
						<Button variant="link" size="sm" type="button" onclick={() => load(failed!)}
							>Retry</Button
						>
					</p>
				{/if}
			</div>
		{/if}
	</div>
</Section>
