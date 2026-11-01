<script lang="ts">
	import FolderKanbanIcon from '@lucide/svelte/icons/folder-kanban';
	import { resolve } from '$app/paths';
	import type { Activity, PageView, ProjectSummary } from '#lib/shared/domain/types.ts';
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { ProjectCard } from '#lib/entities/project/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { CreateProjectDialog } from '#lib/features/project-form/index.ts';
	import { PROJECT_ZONE, useProjectOrder } from '#lib/features/reorder-projects/index.ts';
	import { ActivityFeed } from '#lib/widgets/activity-feed/index.ts';

	let { projects, activity }: { projects: ProjectSummary[]; activity: PageView<Activity> } =
		$props();

	const order = useProjectOrder(() => projects);
	const { sortable } = order;
	const dropBefore = $derived(sortable.active ? sortable.over?.beforeId : undefined);
</script>

{#snippet dropBar()}
	<div class="absolute -inset-y-1 -left-2.5 w-0.5 rounded-full bg-brand" aria-hidden="true"></div>
{/snippet}

<div class="space-y-8">
	<PageHeader title="Projects">
		{#snippet description()}
			Track what AI agents plan and ship. Each epic shows a Dev → Tests → Deploy board, with specs
			translated for humans.
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
				<div
					class="grid gap-4 sm:grid-cols-2"
					{@attach sortable.zone(PROJECT_ZONE, { grid: true })}
				>
					{#each order.projects as project, index (project.id)}
						<div class="relative flex">
							{#if dropBefore === project.id}{@render dropBar()}{/if}
							<ProjectCard
								{project}
								href={resolve('/projects/[project]', { project: project.key })}
								class={cn(
									'flex-1 cursor-grab touch-manipulation select-none [-webkit-touch-callout:none]',
									sortable.active?.id === project.id && 'opacity-40'
								)}
								{@attach sortable.item(project.id, PROJECT_ZONE)}
							/>
							{#if dropBefore === null && index === order.projects.length - 1}
								<div
									class="absolute -inset-y-1 -right-2.5 w-0.5 rounded-full bg-brand"
									aria-hidden="true"
								></div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</Section>
		<ActivityFeed
			items={activity.items}
			page={activity.page}
			pageCount={activity.pageCount}
			total={activity.total}
			pageSize={activity.pageSize}
			title="Recent activity"
			projects={Object.fromEntries(projects.map((p) => [p.id, { key: p.key, name: p.name }]))}
		/>
	</div>
</div>
