<script lang="ts">
	import { displayKey } from '#lib/shared/domain/display-key.ts';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type {
		Activity,
		PageView,
		EpicDetail,
		Project,
		Spec,
		SpecSummary,
		SyncJob
	} from '#lib/shared/domain/types.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { MarkdownViewer } from '#lib/shared/ui/markdown/index.ts';
	import { Crumbs } from '#lib/widgets/app-shell/index.ts';
	import { EpicHeader } from '#lib/widgets/epic-header/index.ts';
	import { StageBoard } from '#lib/widgets/stage-board/index.ts';
	import { OpenThreadsAlert } from '#lib/features/epic-threads/index.ts';
	import { SpecPanel } from '#lib/widgets/spec-panel/index.ts';
	import { ActivityFeed } from '#lib/widgets/activity-feed/index.ts';
	import { SyncLog } from '#lib/widgets/sync-log/index.ts';

	interface Props {
		project: Project;
		epic: EpicDetail;
		selectedSpec: Spec | null;
		activity: PageView<Activity>;
		syncJobs: SyncJob[];
		ticketUrl: string | null;
	}

	let { project, epic, selectedSpec, activity, syncJobs, ticketUrl }: Props = $props();
	let questionsOpen = $state(false);
	let focusQuestion = $state<string | null>(null);

	// A link from the activity list carries ?question=<id>; a question that no longer exists opens nothing.
	function openLinkedQuestion() {
		const id = page.url.searchParams.get('question');
		if (!id) return;
		if (epic.questions.some((q) => q.id === id)) {
			focusQuestion = id;
			questionsOpen = true;
		}
		const url = new URL(page.url.href);
		url.searchParams.delete('question');
		replaceState(resolve(`${url.pathname}${url.search}` as '/'), page.state);
	}
	afterNavigate(openLinkedQuestion);
	const taskKeys = $derived(new Map(epic.tasks.map((t) => [t.id, displayKey(t)])));
	const ownerLabel = (spec: SpecSummary) =>
		spec.taskId ? (taskKeys.get(spec.taskId) ?? null) : null;
</script>

<div class="space-y-10">
	<div class="space-y-4">
		<Crumbs
			items={[
				{ label: project.name, href: resolve('/projects/[project]', { project: project.key }) },
				{ label: displayKey(epic), mono: true }
			]}
		/>
		<EpicHeader {epic} {project} {ticketUrl} bind:questionsOpen bind:focusQuestion />
	</div>

	{#if epic.summary}
		<Section title="Description">
			<div class="rounded-xl border bg-card p-5">
				<MarkdownViewer source={epic.summary} />
			</div>
		</Section>
	{/if}

	<OpenThreadsAlert openThreads={epic.openQuestions} onopen={() => (questionsOpen = true)} />

	<Section title="Board">
		{#key epic.id}
			<StageBoard {epic} />
		{/key}
	</Section>

	<div class="space-y-10">
		<SpecPanel
			specs={epic.specs}
			selected={selectedSpec}
			owner={{ type: 'epic', id: epic.id }}
			{ownerLabel}
		/>
		<div class="grid gap-10 lg:grid-cols-2">
			<ActivityFeed
				items={activity.items}
				page={activity.page}
				pageCount={activity.pageCount}
				total={activity.total}
				pageSize={activity.pageSize}
				query={{ epic: epic.id }}
			/>
			{#if epic.externalRef}<SyncLog jobs={syncJobs} />{/if}
		</div>
	</div>
</div>
