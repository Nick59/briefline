<script lang="ts">
	import { useEpicOrder } from '#lib/shared/lib/epic-order/index.svelte.ts';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SettingsIcon from '@lucide/svelte/icons/settings-2';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { EpicSummary, ProjectSummary } from '#lib/shared/domain/types.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { statusTone } from '#lib/shared/config/tokens/index.ts';
	import { ProgressRing } from '#lib/shared/ui/progress/index.ts';
	import { StatusIcon } from '#lib/entities/work-status/index.ts';
	import { CreateProjectDialog } from '#lib/features/project-form/index.ts';

	interface Props {
		projects: ProjectSummary[];
		activeProjectKey: string | null;
		activeEpics: EpicSummary[];
		onnavigate?: () => void;
	}

	let { projects, activeProjectKey, activeEpics, onnavigate }: Props = $props();
	const epicOrder = useEpicOrder(() => activeProjectKey);
	const orderedEpics = $derived(epicOrder.sort(activeEpics));
	const path = $derived(page.url.pathname);
</script>

<div class="flex items-center justify-between px-2 pb-1">
	<p class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Projects</p>
	<CreateProjectDialog>
		{#snippet trigger({ props })}
			<button
				{...props}
				class="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
				aria-label="New project"
			>
				<PlusIcon class="size-3.5" />
			</button>
		{/snippet}
	</CreateProjectDialog>
</div>

<ul class="space-y-0.5">
	{#each projects as project (project.id)}
		{@const active = project.key === activeProjectKey}
		{@const projectHref = resolve('/projects/[project]', { project: project.key })}
		<li>
			<a
				href={projectHref}
				onclick={onnavigate}
				aria-current={path === projectHref ? 'page' : undefined}
				class={cn(
					'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent',
					active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
				)}
			>
				<span
					class={cn(
						'grid size-6 shrink-0 place-items-center rounded font-mono text-[9px] font-semibold',
						active ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'
					)}
				>
					{project.key.slice(0, 3)}
				</span>
				<span class="min-w-0 flex-1 truncate">{project.name}</span>
				<ProgressRing
					value={project.progress.percent}
					size={18}
					stroke={2.5}
					tone="status-done"
					showLabel={false}
				/>
			</a>
			{#if active}
				<ul class="my-1 ml-[1.15rem] space-y-0.5 border-l pl-2">
					{#each orderedEpics as epic (epic.id)}
						{@const epicHref = resolve('/projects/[project]/epics/[epic]', {
							project: project.key,
							epic: epic.key
						})}
						<li>
							<a
								href={epicHref}
								onclick={onnavigate}
								aria-current={path.startsWith(epicHref) ? 'page' : undefined}
								class={cn(
									'flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
									path.startsWith(epicHref) && 'bg-sidebar-accent text-foreground'
								)}
							>
								<StatusIcon
									status={epic.progress.status}
									tone={statusTone[epic.progress.status]}
									size={12}
								/>
								<span class="truncate">{epic.title}</span>
							</a>
						</li>
					{:else}
						<li class="px-2 py-1 text-xs text-muted-foreground">No epics yet</li>
					{/each}
					<li>
						<a
							href={resolve('/projects/[project]/settings', { project: project.key })}
							onclick={onnavigate}
							class="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
						>
							<SettingsIcon class="size-3" />Settings
						</a>
					</li>
				</ul>
			{/if}
		</li>
	{:else}
		<li class="px-2 py-1 text-xs text-muted-foreground">No projects yet</li>
	{/each}
</ul>
