<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Textarea } from '#lib/shared/ui/primitives/textarea/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { STATUS_LABELS, WORK_STATUSES, type WorkStatus } from '#lib/shared/domain/constants.ts';
	import type { PhaseWithProgress } from '#lib/shared/domain/types.ts';

	interface Props {
		epicId: string;
		/** Edit this phase instead of creating one. */
		phase?: PhaseWithProgress;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { epicId, phase, trigger }: Props = $props();

	let open = $state(false);
	let name = $state('');
	let description = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let status = $state<WorkStatus>('todo');
	let busy = $state(false);

	$effect(() => {
		if (open) {
			name = phase?.name ?? '';
			description = phase?.description ?? '';
			startDate = phase?.startDate ?? '';
			endDate = phase?.endDate ?? '';
			status = phase?.status ?? 'todo';
		}
	});

	const derivedStatus = $derived(Boolean(phase && phase.taskIds.length > 0));

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const fields = {
			name,
			description,
			startDate: startDate || null,
			endDate: endDate || null,
			...(derivedStatus ? {} : { status })
		};
		const outcome = phase
			? await runOperation(
					'update_phase',
					{ phase: phase.id, ...fields },
					{ success: 'Phase updated' }
				)
			: await runOperation('create_phase', { epic: epicId, ...fields }, { success: 'Phase added' });
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
	<Dialog.Content class="sm:max-w-lg">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>{phase ? 'Edit phase' : 'Add phase'}</Dialog.Title>
				<Dialog.Description
					>Phases form the vertical timeline of the epic, in order.</Dialog.Description
				>
			</Dialog.Header>
			<Field label="Name" for="phase-name">
				<Input id="phase-name" bind:value={name} required maxlength={120} />
			</Field>
			<Field label="Description" for="phase-description">
				<Textarea id="phase-description" bind:value={description} rows={2} />
			</Field>
			<div class="grid gap-3 sm:grid-cols-3">
				<Field label="Start" for="phase-start"
					><Input id="phase-start" type="date" bind:value={startDate} /></Field
				>
				<Field label="End" for="phase-end"
					><Input
						id="phase-end"
						type="date"
						bind:value={endDate}
						min={startDate || undefined}
					/></Field
				>
				<Field
					label="Status"
					for="phase-status"
					hint={derivedStatus ? 'Follows its tasks' : undefined}
				>
					{#if derivedStatus}
						<Input id="phase-status" value={STATUS_LABELS[phase!.effectiveStatus]} disabled />
					{:else}
						<ChoiceSelect
							id="phase-status"
							bind:value={status}
							options={WORK_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
						/>
					{/if}
				</Field>
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !name}>{phase ? 'Save' : 'Add phase'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
