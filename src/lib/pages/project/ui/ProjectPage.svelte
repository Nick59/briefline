<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SettingsIcon from '@lucide/svelte/icons/settings-2';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import { resolve } from '$app/paths';
	import type {
		Activity,
		PageView,
		EpicSummary,
		Spec,
		SpecSummary,
		Project,
		SyncJob,
		Task
	} from '#lib/shared/domain/types.ts';
	import { computeProgress } from '#lib/shared/domain/progress.ts';
	import { statusTone } from '#lib/shared/config/tokens/index.ts';
	import { displayKey, displayKeyTitle } from '#lib/shared/domain/display-key.ts';
	import { formatDate, pluralize } from '#lib/shared/lib/format.ts';
	import { ProgressRing } from '#lib/shared/ui/progress/index.ts';
	import { StageProgressList } from '#lib/entities/epic/index.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { KeyChip } from '#lib/shared/ui/key-chip/index.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';
	import type { PullStatus } from '#lib/shared/domain/pull-status.ts';
	import { TicketPullStatus } from '#lib/features/pull-tickets/index.ts';
	import { ArchiveDoneEpicsButton, RestoreEpicButton } from '#lib/features/archive-epics/index.ts';
	import { EpicFormDialog } from '#lib/features/epic-form/index.ts';
	import { ActivityFeed } from '#lib/widgets/activity-feed/index.ts';
	import { SyncLog } from '#lib/widgets/sync-log/index.ts';
	import { ProjectTimeline } from '#lib/widgets/project-timeline/index.ts';
	import { ProjectSpecsDialog } from '#lib/widgets/spec-panel/index.ts';

	interface Props {
		project: Project;
		epics: (EpicSummary & { tasks: Task[] })[];
		archivedEpics: EpicSummary[];
		specs: SpecSummary[];
		selectedSpec: Spec | null;
		activity: PageView<Activity>;
		syncJobs: SyncJob[];
		pullStatus: PullStatus | null;
	}

	let {
		project,
		epics,
		archivedEpics,
		specs,
		selectedSpec,
		activity,
		syncJobs,
		pullStatus
	}: Props = $props();

	const tasks = $derived(epics.flatMap((e) => e.tasks).filter((t) => !t.cancelledAt));
	const progress = $derived(computeProgress(tasks));
</script>

{#snippet newEpic()}
	<EpicFormDialog projectKey={project.key}>
		{#snippet trigger({ props })}<Button {...props}><PlusIcon />New epic</Button>{/snippet}
	</EpicFormDialog>
{/snippet}

<div class="space-y-8">
	<PageHeader title={project.name}>
		{#snippet titleAddon()}
			{#if pullStatus}<TicketPullStatus projectId={project.id} initial={pullStatus} />{/if}
		{/snippet}
		{#snippet eyebrow()}
			<KeyChip value={project.key} />
			{#if project.ticketing.provider}<ToneBadge tone="neutral" variant="dot"
					>Tickets synced with {project.ticketing.provider}</ToneBadge
				>{/if}
		{/snippet}
		{#snippet description()}
			{project.description}
			<div class="mt-3">
				<ProjectSpecsDialog projectId={project.id} {specs} selected={selectedSpec} />
			</div>
		{/snippet}
		{#snippet actions()}
			<ArchiveDoneEpicsButton
				projectKey={project.key}
				count={epics.filter((e) => e.progress.status === 'done').length}
			/>
			<Button
				href={resolve('/projects/[project]/settings', { project: project.key })}
				variant="outline"><SettingsIcon />Settings</Button
			>
			{@render newEpic()}
		{/snippet}
	</PageHeader>

	{#if tasks.length > 0}
		<div
			class="grid gap-6 rounded-xl border bg-card p-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center"
		>
			<div class="flex items-center gap-4">
				<ProgressRing
					value={progress.percent}
					size={64}
					stroke={5}
					tone={statusTone[progress.status]}
				/>
				<div class="text-sm">
					<p class="font-medium">Overall progress</p>
					<p class="text-muted-foreground">
						{pluralize(tasks.length, 'task')} across {pluralize(epics.length, 'epic')}
					</p>
				</div>
			</div>
			<StageProgressList {progress} />
		</div>
	{/if}

	<div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<Section title="Epics" count={epics.length}>
			{#if epics.length === 0}
				<EmptyState
					title="No epics yet"
					description="Create an epic, or ask an agent to call create_epic with its plan."
				>
					{#snippet icon()}<LayersIcon />{/snippet}
					{#snippet action()}{@render newEpic()}{/snippet}
				</EmptyState>
			{:else}
				<ProjectTimeline {epics} projectKey={project.key} />
			{/if}
			{#if archivedEpics.length > 0}
				<details class="mt-6 rounded-xl border bg-card">
					<summary class="cursor-pointer px-4 py-3 text-sm font-medium">
						Archived epics ({archivedEpics.length})
					</summary>
					<ul class="divide-y border-t">
						{#each archivedEpics as epic (epic.id)}
							<li class="flex flex-wrap items-center gap-2 px-4 py-2">
								<KeyChip value={displayKey(epic)} title={displayKeyTitle(epic)} />
								<a
									href={resolve('/projects/[project]/epics/[epic]', {
										project: project.key,
										epic: epic.key
									})}
									class="min-w-0 flex-1 truncate text-sm font-medium hover:underline focus-visible:underline focus-visible:outline-none"
									>{epic.title}</a
								>
								<span class="text-xs text-muted-foreground"
									>Archived since {formatDate(epic.archivedAt, true)}</span
								>
								<RestoreEpicButton {epic} />
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</Section>
		<div class="space-y-8">
			<ActivityFeed
				items={activity.items}
				page={activity.page}
				pageCount={activity.pageCount}
				total={activity.total}
				pageSize={activity.pageSize}
				query={{ project: project.id }}
			/>
			{#if project.ticketing.provider}<SyncLog jobs={syncJobs} />{/if}
		</div>
	</div>
</div>
