<script lang="ts">
	import { displayKey } from '#lib/shared/domain/display-key.ts';
	import type { Snippet } from 'svelte';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Textarea } from '#lib/shared/ui/primitives/textarea/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { PRIORITIES, PRIORITY_LABELS, type Priority } from '#lib/shared/domain/constants.ts';
	import type { Task } from '#lib/shared/domain/types.ts';

	interface Props {
		epicId: string;
		/** Edit this task instead of creating one. */
		task?: Task;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { epicId, task, trigger }: Props = $props();

	let open = $state(false);
	let title = $state('');
	let summary = $state('');
	let description = $state('');
	let priority = $state<Priority>('medium');
	let assignee = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open) {
			title = task?.title ?? '';
			summary = task?.summary ?? '';
			description = task?.description ?? '';
			priority = task?.priority ?? 'medium';
			assignee = task?.assignee ?? '';
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
		const outcome = task
			? await runOperation('update_task', { task: task.id, ...fields }, { success: 'Task updated' })
			: await runOperation('create_task', { epic: epicId, ...fields }, { success: 'Task created' });
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
				<Field label="Assignee" for="task-assignee">
					<Input id="task-assignee" bind:value={assignee} placeholder="agent name or person" />
				</Field>
			</div>
			<Field label="Description (markdown)" for="task-description">
				<Textarea
					id="task-description"
					bind:value={description}
					rows={10}
					class="font-mono text-xs leading-relaxed"
				/>
			</Field>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !title}>{task ? 'Save' : 'Create task'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
