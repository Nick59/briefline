<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { resolve } from '$app/paths';
	import type { EpicDetail } from '#lib/shared/domain/types.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { PhaseFormDialog } from '#lib/features/phase-form/index.ts';
	import TimelinePhase from './TimelinePhase.svelte';
	import TimelineTaskRow from './TimelineTaskRow.svelte';

	let { epic }: { epic: EpicDetail } = $props();

	const tasksByPhase = $derived(Map.groupBy(epic.tasks, (t) => t.phaseId ?? ''));
	const unphased = $derived(tasksByPhase.get('') ?? []);
</script>

<Section title="Timeline" count={epic.phases.length}>
	{#snippet actions()}
		<PhaseFormDialog epicId={epic.id}>
			{#snippet trigger({ props })}
				<Button {...props} variant="ghost" size="xs"><PlusIcon />Phase</Button>
			{/snippet}
		</PhaseFormDialog>
	{/snippet}

	{#if epic.phases.length === 0}
		<EmptyState
			title="No phases yet"
			description="Phases split the epic into steps on a vertical timeline."
		/>
	{:else}
		<ol>
			{#each epic.phases as phase, index (phase.id)}
				<TimelinePhase
					{phase}
					{index}
					tasks={tasksByPhase.get(phase.id) ?? []}
					projectKey={epic.project.key}
					epicKey={epic.key}
					isLast={index === epic.phases.length - 1}
				/>
			{/each}
		</ol>
	{/if}

	{#if unphased.length}
		<div class="rounded-lg border border-dashed p-3">
			<p class="mb-1 text-xs font-medium text-muted-foreground">Not in a phase</p>
			<ul class="-mx-2">
				{#each unphased as task (task.id)}
					<TimelineTaskRow
						{task}
						href={resolve('/projects/[project]/epics/[epic]/tasks/[task]', {
							project: epic.project.key,
							epic: epic.key,
							task: task.key
						})}
					/>
				{/each}
			</ul>
		</div>
	{/if}
</Section>
