<script lang="ts">
	import { displayKey, displayKeyTitle } from '#lib/shared/domain/display-key.ts';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import LinkIcon from '@lucide/svelte/icons/link';
	import UserIcon from '@lucide/svelte/icons/user-round';
	import { resolve } from '$app/paths';
	import { STAGES } from '#lib/shared/domain/constants.ts';
	import { taskOverallStatus } from '#lib/shared/domain/progress.ts';
	import type { Activity, PageView, Project, Spec, TaskDetail } from '#lib/shared/domain/types.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { KeyChip } from '#lib/shared/ui/key-chip/index.ts';
	import { MarkdownViewer } from '#lib/shared/ui/markdown/index.ts';
	import { StatusBadge } from '#lib/entities/work-status/index.ts';
	import { PriorityBadge } from '#lib/entities/task/index.ts';
	import { ExternalTicketBadge } from '#lib/entities/epic/index.ts';
	import { StageStatusControl } from '#lib/features/change-task-status/index.ts';
	import { TaskComments } from '#lib/features/task-comments/index.ts';
	import { TaskFormDialog } from '#lib/features/task-form/index.ts';
	import { LinkTicketDialog } from '#lib/features/link-ticket/index.ts';
	import { DeleteButton } from '#lib/features/delete-entity/index.ts';
	import { Crumbs } from '#lib/widgets/app-shell/index.ts';
	import { SpecPanel } from '#lib/widgets/spec-panel/index.ts';
	import { ActivityFeed } from '#lib/widgets/activity-feed/index.ts';

	interface Props {
		project: Project;
		task: TaskDetail;
		selectedSpec: Spec | null;
		activity: PageView<Activity>;
		ticketUrl: string | null;
	}

	let { project, task, selectedSpec, activity, ticketUrl }: Props = $props();
	const epicHref = $derived(
		resolve('/projects/[project]/epics/[epic]', { project: project.key, epic: task.epic.key })
	);
</script>

<div class="space-y-10">
	<div class="space-y-4">
		<Crumbs
			items={[
				{ label: project.name, href: resolve('/projects/[project]', { project: project.key }) },
				{ label: displayKey(task.epic), href: epicHref, mono: true },
				{ label: displayKey(task), mono: true }
			]}
		/>
		<PageHeader title={task.title}>
			{#snippet eyebrow()}
				<KeyChip value={displayKey(task)} title={displayKeyTitle(task)} />
				<StatusBadge status={taskOverallStatus(task.stages)} />
				<PriorityBadge priority={task.priority} />
				{#if task.assignee}<span class="inline-flex items-center gap-1 text-xs"
						><UserIcon class="size-3" />{task.assignee}</span
					>{/if}
				{#if task.externalRef}<ExternalTicketBadge ref={task.externalRef} url={ticketUrl} />{/if}
			{/snippet}
			{#snippet actions()}
				<LinkTicketDialog
					target={{ type: 'task', id: task.id }}
					current={task.externalRef}
					defaultProvider={project.ticketing?.provider ?? null}
				>
					{#snippet trigger({ props })}<Button {...props} variant="outline" size="sm"
							><LinkIcon />Ticket</Button
						>{/snippet}
				</LinkTicketDialog>
				<TaskFormDialog epicId={task.epicId} {task}>
					{#snippet trigger({ props })}<Button {...props} variant="outline" size="sm"
							><PencilIcon />Edit</Button
						>{/snippet}
				</TaskFormDialog>
				<DeleteButton
					operation="delete_task"
					input={{ task: task.id }}
					what="task {displayKey(task)}"
					consequence="Its specs are deleted too."
					redirectTo={epicHref}
				/>
			{/snippet}
		</PageHeader>
	</div>

	<Section title="Progress">
		<div class="grid gap-2 lg:grid-cols-3">
			{#each STAGES as stage (stage)}
				<StageStatusControl {task} {stage} />
			{/each}
		</div>
	</Section>

	{#if task.description || task.summary}
		<Section title="Description">
			<div class="rounded-xl border bg-card p-5">
				<MarkdownViewer source={task.description || task.summary} />
			</div>
		</Section>
	{/if}

	<div class="grid gap-10 xl:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="min-w-0 space-y-10">
			<TaskComments taskId={task.id} comments={task.comments} />
			<SpecPanel specs={task.specs} selected={selectedSpec} owner={{ type: 'task', id: task.id }} />
		</div>
		<ActivityFeed
			items={activity.items}
			page={activity.page}
			pageCount={activity.pageCount}
			total={activity.total}
			pageSize={activity.pageSize}
			query={{ task: task.id }}
		/>
	</div>
</div>
