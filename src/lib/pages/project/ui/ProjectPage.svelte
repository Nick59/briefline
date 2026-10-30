<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SettingsIcon from '@lucide/svelte/icons/settings-2';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import { resolve } from '$app/paths';
	import type {
		Activity,
		PageView,
		EpicSummary,
		Project,
		SyncJob,
		Task
	} from '#lib/shared/domain/types.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { KeyChip } from '#lib/shared/ui/key-chip/index.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';
	import { EpicFormDialog } from '#lib/features/epic-form/index.ts';
	import { ActivityFeed } from '#lib/widgets/activity-feed/index.ts';
	import { SyncLog } from '#lib/widgets/sync-log/index.ts';
	import { ProjectTimeline } from '#lib/widgets/project-timeline/index.ts';

	interface Props {
		project: Project;
		epics: (EpicSummary & { tasks: Task[] })[];
		activity: PageView<Activity>;
		syncJobs: SyncJob[];
	}

	let { project, epics, activity, syncJobs }: Props = $props();
</script>

{#snippet newEpic()}
	<EpicFormDialog projectKey={project.key}>
		{#snippet trigger({ props })}<Button {...props}><PlusIcon />New epic</Button>{/snippet}
	</EpicFormDialog>
{/snippet}

<div class="space-y-8">
	<PageHeader title={project.name}>
		{#snippet eyebrow()}
			<KeyChip value={project.key} />
			{#if project.ticketing}<ToneBadge tone="neutral" variant="dot"
					>Tickets synced with {project.ticketing.provider}</ToneBadge
				>{/if}
		{/snippet}
		{#snippet description()}{project.description}{/snippet}
		{#snippet actions()}
			<Button
				href={resolve('/projects/[project]/settings', { project: project.key })}
				variant="outline"><SettingsIcon />Settings</Button
			>
			{@render newEpic()}
		{/snippet}
	</PageHeader>

	<div class="grid gap-8 xl:grid-cols-[1fr_22rem]">
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
		</Section>
		<div class="space-y-8">
			<ActivityFeed items={activity.items} page={activity.page} pageCount={activity.pageCount} />
			{#if project.ticketing}<SyncLog jobs={syncJobs} />{/if}
		</div>
	</div>
</div>
