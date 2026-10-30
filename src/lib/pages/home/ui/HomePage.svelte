<script lang="ts">
	import FolderKanbanIcon from '@lucide/svelte/icons/folder-kanban';
	import { resolve } from '$app/paths';
	import type { Activity, PageView, ProjectSummary } from '#lib/shared/domain/types.ts';
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { ProjectCard } from '#lib/entities/project/index.ts';
	import { CreateProjectDialog } from '#lib/features/project-form/index.ts';
	import { ActivityFeed } from '#lib/widgets/activity-feed/index.ts';

	let { projects, activity }: { projects: ProjectSummary[]; activity: PageView<Activity> } =
		$props();
</script>

<div class="space-y-8">
	<PageHeader title="Projects">
		{#snippet description()}
			Track what AI agents plan and ship. Each epic shows a timeline of phases and a Dev → Tests →
			Deploy board, with specs translated for humans.
		{/snippet}
		{#snippet actions()}<CreateProjectDialog />{/snippet}
	</PageHeader>

	<div class="grid gap-8 xl:grid-cols-[1fr_22rem]">
		<Section title="All projects" count={projects.length}>
			{#if projects.length === 0}
				<EmptyState
					title="No projects yet"
					description="Create one here, or let an agent call create_project through the API or MCP."
				>
					{#snippet icon()}<FolderKanbanIcon />{/snippet}
					{#snippet action()}<CreateProjectDialog />{/snippet}
				</EmptyState>
			{:else}
				<div class="grid gap-4 sm:grid-cols-2">
					{#each projects as project (project.id)}
						<ProjectCard
							{project}
							href={resolve('/projects/[project]', { project: project.key })}
						/>
					{/each}
				</div>
			{/if}
		</Section>
		<ActivityFeed
			items={activity.items}
			page={activity.page}
			pageCount={activity.pageCount}
			title="Recent activity"
		/>
	</div>
</div>
