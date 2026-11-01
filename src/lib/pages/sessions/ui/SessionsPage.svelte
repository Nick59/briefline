<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as current } from '$app/state';
	import type { PageView, SessionSummary } from '#lib/shared/domain/types.ts';
	import { SessionCard, groupByDay } from '#lib/entities/session/index.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.ts';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';

	interface Props {
		sessions: PageView<SessionSummary>;
		actors: string[];
		filters: { actor: string | null };
	}

	let { sessions, actors, filters }: Props = $props();

	const ALL = 'all';
	const groups = $derived(groupByDay(sessions.items));
	const actorOptions = $derived([
		{ value: ALL, label: 'All agents' },
		...(filters.actor && !actors.includes(filters.actor) ? [filters.actor] : actors).map(
			(name) => ({ value: name, label: name })
		)
	]);

	function go(change: (params: URLSearchParams) => void) {
		const url = new URL(current.url.href);
		change(url.searchParams);
		void goto(resolve(`${url.pathname}${url.search}` as '/sessions'));
	}

	const showPage = (target: number) =>
		go((params) => (target <= 1 ? params.delete('page') : params.set('page', String(target))));

	function filterActor(value: string) {
		go((params) => {
			params.delete('page');
			if (value === ALL) params.delete('actor');
			else params.set('actor', value);
		});
	}
</script>

<div class="max-w-4xl space-y-6">
	<PageHeader title="Sessions">
		{#snippet description()}
			What each agent session did, newest first. Sessions that changed nothing are left out.
		{/snippet}
	</PageHeader>

	<div class="max-w-xs" role="group" aria-label="Filters">
		<ChoiceSelect
			value={filters.actor ?? ALL}
			options={actorOptions}
			onchange={filterActor}
			class="w-full"
		/>
	</div>

	{#if sessions.items.length === 0}
		<EmptyState
			title={filters.actor ? 'No sessions match this filter' : 'No sessions yet'}
			description="Sessions appear when an agent connects over MCP and changes something."
		/>
	{:else}
		{#each groups as group (group.label)}
			<Section title={group.label} count={group.sessions.length}>
				<ol class="grid gap-3">
					{#each group.sessions as session (session.id)}
						<SessionCard {session} />
					{/each}
				</ol>
			</Section>
		{/each}
		<div class="flex flex-col gap-3">
			<p class="text-sm text-muted-foreground" data-testid="sessions-range">
				Showing {(sessions.page - 1) * sessions.pageSize + 1}–{(sessions.page - 1) *
					sessions.pageSize +
					sessions.items.length} of {sessions.total}
			</p>
			{#if sessions.pageCount > 1}
				<nav class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2" aria-label="Pages">
					<Button
						variant="outline"
						size="sm"
						type="button"
						disabled={sessions.page <= 1}
						onclick={() => showPage(sessions.page - 1)}>Previous</Button
					>
					<span class="text-sm text-muted-foreground"
						>Page {sessions.page} of {sessions.pageCount}</span
					>
					<Button
						variant="outline"
						size="sm"
						type="button"
						disabled={sessions.page >= sessions.pageCount}
						onclick={() => showPage(sessions.page + 1)}>Next</Button
					>
				</nav>
			{/if}
		</div>
	{/if}
</div>
