<script lang="ts">
	import { displayKey, displayKeyTitle } from '#lib/shared/domain/display-key.ts';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { resolve } from '$app/paths';
	import type { EpicDetail, Project } from '#lib/shared/domain/types.ts';
	import { statusTone } from '#lib/shared/config/tokens/index.ts';
	import { daysUntil, formatDate, pluralize } from '#lib/shared/lib/format.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { KeyChip } from '#lib/shared/ui/key-chip/index.ts';
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import { ProgressRing } from '#lib/shared/ui/progress/index.ts';
	import { StageBadge, StatusBadge } from '#lib/entities/work-status/index.ts';
	import {
		ExternalTicketBadge,
		ReadinessBadge,
		StageProgressList
	} from '#lib/entities/epic/index.ts';
	import { EpicFormDialog } from '#lib/features/epic-form/index.ts';
	import { TaskFormDialog } from '#lib/features/task-form/index.ts';
	import { LinkTicketDialog } from '#lib/features/link-ticket/index.ts';
	import { SyncNowButton } from '#lib/features/sync-ticket/index.ts';
	import { NewThreadDialog, ThreadsDialog } from '#lib/features/epic-threads/index.ts';
	import { DeleteButton } from '#lib/features/delete-entity/index.ts';

	let {
		epic,
		project,
		ticketUrl,
		questionsOpen = $bindable(false),
		focusQuestion = $bindable(null)
	}: {
		epic: EpicDetail;
		project: Project;
		ticketUrl: string | null;
		questionsOpen?: boolean;
		focusQuestion?: string | null;
	} = $props();
	const remaining = $derived(epic.targetDate ? daysUntil(epic.targetDate) : null);
</script>

<div class="space-y-6">
	<PageHeader title={epic.title}>
		{#snippet eyebrow()}
			<KeyChip value={displayKey(epic)} title={displayKeyTitle(epic)} />
			<StatusBadge status={epic.progress.status} />
			{#if epic.progress.currentStage}<StageBadge
					stage={epic.progress.currentStage}
					variant="dot"
				/>{/if}
			{#if epic.externalRef}<ExternalTicketBadge ref={epic.externalRef} url={ticketUrl} />{/if}
		{/snippet}
		{#snippet titleAddon()}
			<ReadinessBadge
				openQuestions={epic.openQuestions}
				questionCount={epic.questionCount}
				specsApproved={!epic.specsRequired || !!epic.specsApprovedAt}
				onclick={() => {
					if (epic.openQuestions > 0 || !epic.specsRequired || epic.specsApprovedAt)
						questionsOpen = true;
					else document.getElementById('epic-specs')?.scrollIntoView({ behavior: 'smooth' });
				}}
			/>
		{/snippet}
		{#snippet actions()}
			<TaskFormDialog epicId={epic.id}>
				{#snippet trigger({ props })}
					<Button {...props} size="sm"><PlusIcon />New task</Button>
				{/snippet}
			</TaskFormDialog>
			<ThreadsDialog
				threads={epic.questions}
				bind:open={questionsOpen}
				bind:focus={focusQuestion}
			/>
			<NewThreadDialog epicId={epic.id} />
			<LinkTicketDialog
				target={{ type: 'epic', id: epic.id }}
				current={epic.externalRef}
				defaultProvider={project.ticketing?.provider ?? null}
			>
				{#snippet trigger({ props })}
					<Button {...props} variant="outline" size="sm"
						><LinkIcon />{epic.externalRef ? 'Ticket' : 'Link ticket'}</Button
					>
				{/snippet}
			</LinkTicketDialog>
			{#if epic.externalRef}<SyncNowButton epicId={epic.id} />{/if}
			<EpicFormDialog projectKey={project.key} {epic}>
				{#snippet trigger({ props })}
					<Button {...props} variant="outline" size="sm"><PencilIcon />Edit</Button>
				{/snippet}
			</EpicFormDialog>
			<DeleteButton
				operation="delete_epic"
				input={{ epic: epic.id }}
				what="epic {displayKey(epic)}"
				consequence="Its tasks and specs are deleted too. Linked tickets are not touched."
				redirectTo={resolve('/projects/[project]', { project: project.key })}
			/>
		{/snippet}
	</PageHeader>

	<div
		class="grid gap-6 rounded-xl border bg-card p-5 md:grid-cols-[auto_1fr_auto] md:items-center"
	>
		<div class="flex items-center gap-4">
			<ProgressRing
				value={epic.progress.percent}
				size={64}
				stroke={5}
				tone={statusTone[epic.progress.status]}
			/>
			<div class="text-sm">
				<p class="font-medium">Overall progress</p>
				<p class="text-muted-foreground">
					{pluralize(epic.tasks.filter((t) => !t.cancelledAt).length, 'task')}
				</p>
			</div>
		</div>
		<StageProgressList progress={epic.progress} />
		{#if epic.targetDate}
			<div class="flex items-center gap-2 text-sm md:flex-col md:items-end md:gap-0.5">
				<span class="inline-flex items-center gap-1.5 text-muted-foreground"
					><CalendarIcon class="size-3.5" />Target</span
				>
				<span class="font-medium">{formatDate(epic.targetDate, true)}</span>
				{#if remaining !== null && epic.progress.status !== 'done'}
					<span class={remaining < 0 ? 'text-xs text-danger' : 'text-xs text-muted-foreground'}>
						{remaining < 0 ? `${-remaining} days late` : `${remaining} days left`}
					</span>
				{/if}
			</div>
		{/if}
	</div>
</div>
