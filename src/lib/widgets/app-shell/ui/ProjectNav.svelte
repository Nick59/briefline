<script lang="ts">
	import ListIcon from '@lucide/svelte/icons/list';
	import SquareCodeIcon from '@lucide/svelte/icons/square-code';
	import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SettingsIcon from '@lucide/svelte/icons/settings-2';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { EpicSummary, ProjectSummary } from '#lib/shared/domain/types.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { epicDisplayStage } from '#lib/shared/domain/progress.ts';
	import { stageTone, statusTone } from '#lib/shared/config/tokens/index.ts';
	import { ProgressRing } from '#lib/shared/ui/progress/index.ts';
	import { StatusIcon } from '#lib/entities/work-status/index.ts';
	import { ReadinessBadge } from '#lib/entities/epic/index.ts';
	import { CreateProjectDialog } from '#lib/features/project-form/index.ts';
	import { PROJECT_ZONE, useProjectOrder } from '#lib/features/reorder-projects/index.ts';
	import { useEpicOrder } from '#lib/features/reorder-epics/index.ts';
	import { pathIsWithin } from '#lib/shared/lib/path-match.ts';
	import { readStored, writeStored } from '#lib/shared/lib/local-storage.ts';
	import { Sortable } from '#lib/shared/lib/dnd/index.ts';

	interface Props {
		projects: ProjectSummary[];
		activeProjectKey: string | null;
		activeEpics: EpicSummary[];
		onnavigate?: () => void;
	}

	let { projects, activeProjectKey, activeEpics, onnavigate }: Props = $props();
	const epicOrder = useEpicOrder(() => activeEpics);
	const path = $derived(page.url.pathname);
	const order = useProjectOrder(() => projects);
	const { sortable } = order;
	const dropBefore = $derived(sortable.active ? sortable.over?.beforeId : undefined);

	const EPIC_ZONE = 'nav-epics';
	const HIDE_DONE_KEY = 'briefline:sidebar-hide-done';
	const isDone = (epic: EpicSummary) => epic.progress.status === 'done';
	const hasDone = $derived(epicOrder.epics.some(isDone));
	let hideDone = $state(true);

	onMount(() => {
		hideDone = readStored(HIDE_DONE_KEY) !== '0';
	});

	function toggleHideDone() {
		hideDone = !hideDone;
		writeStored(HIDE_DONE_KEY, hideDone ? '1' : '0');
	}

	function epicPathMatches(epic: EpicSummary) {
		return (
			activeProjectKey !== null &&
			pathIsWithin(
				path,
				resolve('/projects/[project]/epics/[epic]', { project: activeProjectKey, epic: epic.key })
			)
		);
	}

	// The open epic stays listed even when done epics are hidden, so the active item is visible.
	const visibleEpics = $derived(
		epicOrder.epics.filter((epic) => !hideDone || !isDone(epic) || epicPathMatches(epic))
	);

	const epicSortable = new Sortable({
		ondrop: ({ id, beforeId }) => {
			if (beforeId !== null) return epicOrder.move(id, beforeId);
			// An end-of-list drop lands right after the last visible epic, ahead of any hidden ones after it.
			const lastVisible = visibleEpics.at(-1);
			const full = epicOrder.epics;
			const next = lastVisible
				? full[full.findIndex((e) => e.id === lastVisible.id) + 1]
				: undefined;
			return epicOrder.move(id, next?.id ?? null);
		}
	});
	const epicDropBefore = $derived(epicSortable.active ? epicSortable.over?.beforeId : undefined);

	const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

{#snippet dropLine()}
	<div class="-my-px h-0.5 rounded-full bg-brand" aria-hidden="true"></div>
{/snippet}

{#snippet epicRow(epic: EpicSummary, projectKey: string)}
	{@const stage = epicDisplayStage(epic.progress)}
	{@const epicHref = resolve('/projects/[project]/epics/[epic]', {
		project: projectKey,
		epic: epic.key
	})}
	<li transition:slide|local={{ duration: reduceMotion() ? 0 : 150 }}>
		{#if epicDropBefore === epic.id}{@render dropLine()}{/if}
		<a
			href={epicHref}
			title={epic.title}
			{@attach epicSortable.item(epic.id, EPIC_ZONE)}
			onclick={onnavigate}
			aria-current={pathIsWithin(path, epicHref) ? 'page' : undefined}
			class={cn(
				'flex cursor-grab touch-manipulation items-start gap-2 rounded-md px-2 py-0.5 text-[13px] text-muted-foreground transition-colors duration-150 select-none [-webkit-touch-callout:none] hover:bg-sidebar-accent hover:text-foreground',
				epicSortable.active?.id === epic.id && 'opacity-40',
				pathIsWithin(path, epicHref) && 'bg-sidebar-accent text-foreground'
			)}
		>
			<span class="mt-1 flex shrink-0">
				<StatusIcon
					status={epic.progress.status}
					tone={stage ? stageTone[stage] : statusTone[epic.progress.status]}
					size={12}
				/>
			</span>
			<span class="line-clamp-2 min-w-0 break-words">{epic.title}</span>
			<div class="ml-auto flex shrink-0 items-center gap-1.5 self-center">
				{#if epic.specsRequired && !epic.specsApprovedAt}
					<span
						role="img"
						aria-label="Specs not approved"
						title="Specs not approved — tasks can't start"
					>
						<LockKeyholeIcon class="size-3.5 text-muted-foreground/60" aria-hidden="true" />
					</span>
				{/if}
				<ReadinessBadge
					compact
					openQuestions={epic.openQuestions}
					questionCount={epic.questionCount}
					specsApproved={!epic.specsRequired || !!epic.specsApprovedAt}
				/>
			</div>
		</a>
	</li>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col">
	<div class="flex shrink-0 items-center justify-between px-2 pb-1">
		<p class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Projects</p>
		<CreateProjectDialog>
			{#snippet trigger({ props })}
				<button
					{...props}
					class="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
					aria-label="New project"
				>
					<PlusIcon class="size-3.5" />
				</button>
			{/snippet}
		</CreateProjectDialog>
	</div>

	<div
		class="flex min-h-0 flex-1 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] flex-col overflow-y-auto"
	>
		<ul class="flex min-h-0 flex-col gap-0.5" {@attach sortable.zone(PROJECT_ZONE)}>
			{#each order.projects as project (project.id)}
				{@const active = project.key === activeProjectKey}
				{@const showToggle = active && hasDone}
				{@const projectHref = resolve('/projects/[project]', { project: project.key })}
				<li class={active ? 'flex min-h-24 flex-col' : 'shrink-0'}>
					{#if dropBefore === project.id}{@render dropLine()}{/if}
					<div class="relative shrink-0">
						<a
							href={projectHref}
							{@attach sortable.item(project.id, PROJECT_ZONE)}
							onclick={onnavigate}
							aria-current={path === projectHref ? 'page' : undefined}
							class={cn(
								'flex cursor-grab touch-manipulation items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors duration-150 select-none [-webkit-touch-callout:none] hover:bg-sidebar-accent',
								sortable.active?.id === project.id && 'opacity-40',
								active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
							)}
						>
							<span
								class={cn(
									'grid size-5 shrink-0 place-items-center rounded font-mono text-[9px] font-semibold',
									active ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'
								)}
							>
								{project.key.slice(0, 3)}
							</span>
							<span class="min-w-0 flex-1 truncate">{project.name}</span>
							<span class={cn('flex shrink-0', showToggle && 'ml-7')}>
								<ProgressRing
									value={project.progress.percent}
									size={16}
									stroke={2.5}
									tone="status-done"
									showLabel={false}
								/>
							</span>
						</a>
						{#if showToggle}
							<button
								type="button"
								onclick={toggleHideDone}
								aria-pressed={hideDone}
								aria-label={hideDone ? 'Show all epics' : 'Show in-progress epics only'}
								title={hideDone ? 'Show all epics' : 'Show in-progress epics only'}
								class="absolute top-1/2 right-7 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
							>
								{#if hideDone}
									<SquareCodeIcon class="size-3.5" aria-hidden="true" />
								{:else}
									<ListIcon class="size-3.5" aria-hidden="true" />
								{/if}
							</button>
						{/if}
					</div>
					{#if active}
						<ul
							class="my-1 ml-3 min-h-0 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] space-y-0.5 overflow-y-auto overscroll-contain border-l pl-1.5"
							{@attach epicSortable.zone(EPIC_ZONE)}
						>
							{#each visibleEpics as epic (epic.id)}
								{@render epicRow(epic, project.key)}
							{:else}
								<li class="px-2 py-1 text-xs text-muted-foreground">
									{epicOrder.epics.length > 0 ? 'All epics done' : 'No epics yet'}
								</li>
							{/each}
							{#if epicDropBefore === null}
								<li aria-hidden="true">{@render dropLine()}</li>
							{/if}
							<li>
								<a
									href={resolve('/projects/[project]/settings', { project: project.key })}
									onclick={onnavigate}
									class="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground"
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
			{#if order.projects.length > 0 && dropBefore === null}
				<li aria-hidden="true">{@render dropLine()}</li>
			{/if}
		</ul>
	</div>
</div>
