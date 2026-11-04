<script lang="ts">
	import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
	import { toneClasses } from '#lib/shared/config/tokens/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
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
	const needsApproval = $derived(epic.specsRequired && !epic.specsApprovedAt);
	const boardLocked = $derived(needsApproval || epic.openQuestions > 0);
	const boardLockReason = $derived(
		needsApproval && epic.openQuestions > 0
			? 'Approve specs and resolve open threads before starting tasks.'
			: needsApproval
				? 'Approve specs before starting tasks.'
				: 'Resolve open threads before starting tasks.'
	);
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

	{#if epic.openQuestions > 0 || needsApproval}
		<div class="space-y-3">
			<OpenThreadsAlert openThreads={epic.openQuestions} onopen={() => (questionsOpen = true)} />

			{#if needsApproval}
				<div
					role="status"
					aria-label="Specs awaiting approval"
					class={cn(
						'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center',
						toneClasses.danger.soft,
						toneClasses.danger.border
					)}
				>
					<LockKeyholeIcon class="size-5 shrink-0" aria-hidden="true" />
					<div class="min-w-0 flex-1 space-y-0.5">
						<p class="font-semibold">Specs need approval — tasks can't start</p>
						<p class="text-sm text-foreground/80">
							Review and approve the specs before starting tasks in this epic.
						</p>
					</div>
					<Button href="#epic-specs" size="sm" class="shrink-0">Review specs</Button>
				</div>
			{/if}
		</div>
	{/if}

	<Section title="Board">
		{#snippet actions()}
			{#if boardLocked}
				<span
					role="status"
					title={boardLockReason}
					class="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground"
				>
					<LockKeyholeIcon class="size-3.5" aria-hidden="true" />Tasks locked
				</span>
			{/if}
		{/snippet}
		{#if boardLocked}
			<p class="text-xs text-muted-foreground">
				{boardLockReason} Work already in progress can continue.
			</p>
		{/if}
		{#key epic.id}
			<StageBoard {epic} />
		{/key}
	</Section>

	<div class="space-y-10">
		<div id="epic-specs" class="scroll-mt-6">
			<SpecPanel
				specs={epic.specs}
				approval={{ approvedAt: epic.specsApprovedAt, approvedBy: epic.specsApprovedBy }}
				selected={selectedSpec}
				owner={{ type: 'epic', id: epic.id }}
				{ownerLabel}
			/>
		</div>
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
