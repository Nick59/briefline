<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Textarea } from '#lib/shared/ui/primitives/textarea/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { PRIORITIES, PRIORITY_LABELS, type Priority } from '#lib/shared/domain/constants.ts';
	import type { Phase, Task } from '#lib/shared/domain/types.ts';

	interface Props {
		epicId: string;
		phases: Pick<Phase, 'id' | 'name'>[];
		/** Edit this task instead of creating one. */
		task?: Task;
		defaultPhaseId?: string | null;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { epicId, phases, task, defaultPhaseId = null, trigger }: Props = $props();

	const NO_PHASE = '__none';
	let open = $state(false);
	let title = $state('');
	let summary = $state('');
	let description = $state('');
	let phaseId = $state(NO_PHASE);
	let priority = $state<Priority>('medium');
	let assignee = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open) {
			title = task?.title ?? '';
			summary = task?.summary ?? '';
			description = task?.description ?? '';
			phaseId = (task ? task.phaseId : defaultPhaseId) ?? NO_PHASE;
			priority = task?.priority ?? 'medium';
			assignee = task?.assignee ?? '';
		}
	});

	const phaseOptions = $derived([
		{ value: NO_PHASE, label: 'No phase' },
		...phases.map((p) => ({ value: p.id, label: p.name }))
	]);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const fields = {
			title,
			summary,
			description,
			priority,
			assignee: assignee || null,
			phaseId: phaseId === NO_PHASE ? null : phaseId
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
				<Dialog.Title>{task ? `Edit ${task.key}` : 'New task'}</Dialog.Title>
			</Dialog.Header>
			<Field label="Title" for="task-title">
				<Input id="task-title" bind:value={title} required maxlength={200} />
			</Field>
			<Field
				label="Plain-language summary"
				for="task-summary"
				hint="One line a non-engineer understands."
			>
				<Input id="task-summary" bind:value={summary} maxlength={500} />
			</Field>
			<div class="grid gap-3 sm:grid-cols-3">
				<Field label="Phase" for="task-phase">
					<ChoiceSelect id="task-phase" bind:value={phaseId} options={phaseOptions} />
				</Field>
				<Field label="Priority" for="task-priority">
					<ChoiceSelect
						id="task-priority"
						bind:value={priority}
						options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
					/>
				</Field>
				<Field label="Assignee" for="task-assignee">
					<Input id="task-assignee" bind:value={assignee} placeholder="claude-code" />
				</Field>
			</div>
			<Field label="Description (markdown)" for="task-description">
				<Textarea
					id="task-description"
					bind:value={description}
					rows={6}
					class="font-mono text-xs"
				/>
			</Field>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !title}>{task ? 'Save' : 'Create task'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
