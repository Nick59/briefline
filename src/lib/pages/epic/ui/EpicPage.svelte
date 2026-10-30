<script lang="ts">
	import { displayKey } from '#lib/shared/domain/display-key.ts';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { resolve } from '$app/paths';
	import type {
		Activity,
		EpicDetail,
		Project,
		Spec,
		SpecSummary,
		SyncJob
	} from '#lib/shared/domain/types.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { TaskFormDialog } from '#lib/features/task-form/index.ts';
	import { Crumbs } from '#lib/widgets/app-shell/index.ts';
	import { EpicHeader } from '#lib/widgets/epic-header/index.ts';
	import { EpicTimeline } from '#lib/widgets/epic-timeline/index.ts';
	import { StageBoard } from '#lib/widgets/stage-board/index.ts';
	import { SpecPanel } from '#lib/widgets/spec-panel/index.ts';
	import { ActivityFeed } from '#lib/widgets/activity-feed/index.ts';
	import { SyncLog } from '#lib/widgets/sync-log/index.ts';

	interface Props {
		project: Project;
		epic: EpicDetail;
		selectedSpec: Spec | null;
		activity: Activity[];
		syncJobs: SyncJob[];
		ticketUrl: string | null;
	}

	let { project, epic, selectedSpec, activity, syncJobs, ticketUrl }: Props = $props();
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
		<EpicHeader {epic} {project} {ticketUrl} />
	</div>

	<Section title="Board">
		{#snippet actions()}
			<TaskFormDialog epicId={epic.id} phases={epic.phases}>
				{#snippet trigger({ props })}<Button {...props} size="sm"><PlusIcon />Task</Button
					>{/snippet}
			</TaskFormDialog>
		{/snippet}
		<StageBoard {epic} />
	</Section>

	<div class="grid gap-10 xl:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="min-w-0 space-y-10">
			<SpecPanel
				specs={epic.specs}
				selected={selectedSpec}
				owner={{ type: 'epic', id: epic.id }}
				{ownerLabel}
			/>
			<div class="grid gap-10 lg:grid-cols-2">
				<ActivityFeed items={activity} />
				{#if epic.externalRef}<SyncLog jobs={syncJobs} />{/if}
			</div>
		</div>
		<aside class="xl:sticky xl:top-6 xl:self-start">
			<EpicTimeline {epic} />
		</aside>
	</div>
</div>
