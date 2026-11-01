<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as current } from '$app/state';
	import { ACTIVITY_WHO, type ActivityWho } from '#lib/shared/domain/actors.ts';
	import type { Activity, PageView, ProjectSummary } from '#lib/shared/domain/types.ts';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import { ActivityFeed } from '#lib/widgets/activity-feed/index.ts';

	interface Props {
		projects: ProjectSummary[];
		activity: PageView<Activity>;
		filters: { project: string | null; who: ActivityWho; actor: string | null };
		actors: string[];
	}

	let { projects, activity, filters, actors }: Props = $props();

	const ALL = 'all';

	const query = $derived({
		...(filters.project ? { project: filters.project } : {}),
		...(filters.who !== 'all' ? { who: filters.who } : {}),
		...(filters.actor ? { actor: filters.actor } : {})
	});

	function showPage(target: number) {
		const url = new URL(current.url.href);
		if (target <= 1) url.searchParams.delete('page');
		else url.searchParams.set('page', String(target));
		replaceState(resolve(`${url.pathname}${url.search}` as '/activity'), current.state);
	}

	const whoLabels: Record<ActivityWho, string> = {
		all: 'Everyone',
		people: 'People',
		agents: 'Agents'
	};
	const projectOptions = $derived([
		{ value: ALL, label: 'All projects' },
		...projects.map((p) => ({ value: p.key, label: `${p.key} · ${p.name}` }))
	]);
	const whoOptions = ACTIVITY_WHO.map((value) => ({ value, label: whoLabels[value] }));
	const actorOptions = $derived([
		{ value: ALL, label: 'All actors' },
		...(filters.actor && !actors.includes(filters.actor) ? [filters.actor] : actors).map(
			(name) => ({ value: name, label: name })
		)
	]);
	const byId = $derived(
		Object.fromEntries(projects.map((p) => [p.id, { key: p.key, name: p.name }]))
	);

	function filter(name: 'project' | 'who' | 'actor', value: string) {
		const url = new URL(current.url.href);
		url.searchParams.delete('page');
		if (value === ALL) url.searchParams.delete(name);
		else url.searchParams.set(name, value);
		void goto(resolve(`${url.pathname}${url.search}` as '/activity'), {
			reset: false
		});
	}

	const filtered = $derived(filters.project || filters.who !== 'all' || filters.actor);
</script>

<div class="max-w-6xl space-y-6">
	<PageHeader title="Activity">
		{#snippet description()}
			Everything that happened across all projects, newest first.
		{/snippet}
	</PageHeader>

	<div class="grid gap-3 sm:grid-cols-3" role="group" aria-label="Filters">
		<ChoiceSelect
			value={filters.project ?? ALL}
			options={projectOptions}
			onchange={(v) => filter('project', v)}
			class="w-full"
		/>
		<ChoiceSelect
			value={filters.who}
			options={whoOptions}
			onchange={(v) => filter('who', v)}
			class="w-full"
		/>
		<ChoiceSelect
			value={filters.actor ?? ALL}
			options={actorOptions}
			onchange={(v) => filter('actor', v)}
			class="w-full"
		/>
	</div>

	<ActivityFeed
		title="Entries"
		{query}
		onpagechange={showPage}
		items={activity.items}
		page={activity.page}
		pageCount={activity.pageCount}
		total={activity.total}
		pageSize={activity.pageSize}
		projects={byId}
		empty={filtered ? 'No activity matches these filters.' : 'Nothing has happened yet.'}
	/>
</div>
