<script lang="ts">
	import {
		AddImageButton,
		imageCommand,
		imageUploadExtension,
		type ImageTarget
	} from '#lib/features/attachment-upload/index.ts';
	import { FormatToolbar } from '#lib/features/markdown-format/index.ts';
	import { MarkdownEditor } from '#lib/shared/ui/markdown-editor/index.ts';
	import type { EditorView } from '@codemirror/view';
	import { page } from '$app/state';
	import { displayKey } from '#lib/shared/domain/display-key.ts';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack, type Snippet } from 'svelte';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Textarea } from '#lib/shared/ui/primitives/textarea/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { PRIORITIES, PRIORITY_LABELS, type Priority } from '#lib/shared/domain/constants.ts';
	import type { EpicSummary, Task } from '#lib/shared/domain/types.ts';

	interface Props {
		epicId: string;
		/** Edit this task instead of creating one. */
		task?: Task;
		/** The project's epics; with more than one, an edited task can be moved between them. */
		epics?: EpicSummary[];
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { epicId, task, epics = [], trigger }: Props = $props();

	let open = $state(false);
	let title = $state('');
	let summary = $state('');
	let description = $state('');
	let priority = $state<Priority>('medium');
	let assignee = $state('');
	let epic = $state('');
	let busy = $state(false);
	let descriptionEl = $state<EditorView | null>(null);
	// A new task has no id yet, so its images go to the project.
	const imageTarget = $derived<ImageTarget | null>(
		task
			? { type: 'task', id: task.id }
			: page.params.project
				? { type: 'project', id: page.params.project }
				: null
	);

	// Reset only on open; live reloads replace props and must not wipe unsaved edits.
	$effect(() => {
		if (open) {
			untrack(() => {
				title = task?.title ?? '';
				summary = task?.summary ?? '';
				description = task?.description ?? '';
				priority = task?.priority ?? 'medium';
				assignee = task?.assignee ?? '';
				epic = task?.epicId ?? '';
			});
		}
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const fields = {
			title,
			summary,
			description,
			priority,
			assignee: assignee || null
		};
		let outcome = task
			? await runOperation('update_task', { task: task.id, ...fields }, { success: 'Task updated' })
			: await runOperation('create_task', { epic: epicId, ...fields }, { success: 'Task created' });
		const destination = epics.find((e) => e.id === epic);
		if (task && outcome.ok && destination && epic !== task.epicId) {
			// The old URL no longer matches the task, so skip the refresh and navigate instead.
			outcome = await runOperation(
				'move_task',
				{ task: task.id, epic },
				{ success: 'Task moved', refresh: false }
			);
			if (outcome.ok && page.params.project) {
				await goto(
					resolve('/projects/[project]/epics/[epic]/tasks/[task]', {
						project: page.params.project,
						epic: destination.key,
						task: task.key
					})
				);
			}
		}
		busy = false;
		if (outcome.ok) open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props })}
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-2xl">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>{task ? `Edit ${displayKey(task)}` : 'New task'}</Dialog.Title>
			</Dialog.Header>
			<Field label="Title" for="task-title">
				<Input id="task-title" bind:value={title} required maxlength={200} />
			</Field>
			<Field
				label="Summary"
				for="task-summary"
				hint="One or two plain sentences, shown on board cards."
			>
				<Textarea id="task-summary" bind:value={summary} maxlength={500} rows={2} />
			</Field>
			<div class="grid gap-3 sm:grid-cols-2">
				<Field label="Priority" for="task-priority">
					<ChoiceSelect
						id="task-priority"
						bind:value={priority}
						options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
					/>
				</Field>
				{#if task && epics.length > 1}
					<Field label="Epic" for="task-epic">
						<ChoiceSelect
							id="task-epic"
							bind:value={epic}
							options={epics.map((e) => ({ value: e.id, label: `${displayKey(e)} · ${e.title}` }))}
						/>
					</Field>
				{/if}
				<Field label="Assignee" for="task-assignee">
					<Input id="task-assignee" bind:value={assignee} placeholder="agent name or person" />
				</Field>
			</div>
			<Field label="Description (markdown)" for="task-description">
				<FormatToolbar view={descriptionEl} />
				<MarkdownEditor
					id="task-description"
					bind:view={descriptionEl}
					bind:value={description}
					extensions={[imageUploadExtension(() => imageTarget)]}
					commands={[imageCommand(() => imageTarget)]}
					minRows={10}
				/>
				<div class="flex justify-end">
					<AddImageButton view={descriptionEl} target={imageTarget} />
				</div>
			</Field>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !title}>{task ? 'Save' : 'Create task'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
