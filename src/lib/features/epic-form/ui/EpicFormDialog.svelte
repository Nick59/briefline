<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Textarea } from '#lib/shared/ui/primitives/textarea/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import type { Epic, EpicDetail } from '#lib/shared/domain/types.ts';
	import { PHASE_TEMPLATES } from '../model/templates.ts';

	interface Props {
		projectKey: string;
		/** Edit this epic instead of creating one. */
		epic?: Epic;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { projectKey, epic, trigger }: Props = $props();

	let open = $state(false);
	let title = $state('');
	let summary = $state('');
	let targetDate = $state('');
	let template = $state('delivery');
	let busy = $state(false);

	$effect(() => {
		if (open) {
			title = epic?.title ?? '';
			summary = epic?.summary ?? '';
			targetDate = epic?.targetDate ?? '';
		}
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const fields = { title, summary, targetDate: targetDate || null };
		if (epic) {
			const outcome = await runOperation(
				'update_epic',
				{ epic: epic.id, ...fields },
				{ success: 'Epic updated' }
			);
			if (outcome.ok) open = false;
		} else {
			const phases =
				PHASE_TEMPLATES.find((t) => t.id === template)?.phases.map((name) => ({ name })) ?? [];
			const outcome = await runOperation<EpicDetail>(
				'create_epic',
				{ project: projectKey, ...fields, phases },
				{ success: 'Epic created', refresh: false }
			);
			if (outcome.ok) {
				open = false;
				await goto(
					resolve('/projects/[project]/epics/[epic]', {
						project: projectKey,
						epic: outcome.result.key
					})
				);
			}
		}
		busy = false;
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
				<Dialog.Title>{epic ? 'Edit epic' : 'New epic'}</Dialog.Title>
				<Dialog.Description>
					{epic
						? 'Update the outcome and the target date.'
						: 'An epic is a deliverable with a timeline of phases. Agents can fill it with tasks and specs.'}
				</Dialog.Description>
			</Dialog.Header>
			<Field label="Title" for="epic-title">
				<Input
					id="epic-title"
					bind:value={title}
					required
					maxlength={200}
					placeholder="Checkout v2"
				/>
			</Field>
			<Field label="Summary" for="epic-summary" hint="The outcome in plain language.">
				<Textarea id="epic-summary" bind:value={summary} rows={3} />
			</Field>
			<div class="grid gap-3 sm:grid-cols-2">
				<Field label="Target date" for="epic-target">
					<Input id="epic-target" type="date" bind:value={targetDate} />
				</Field>
				{#if !epic}
					<Field label="Timeline" for="epic-template">
						<ChoiceSelect
							id="epic-template"
							bind:value={template}
							options={PHASE_TEMPLATES.map((t) => ({ value: t.id, label: t.label }))}
						/>
					</Field>
				{/if}
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !title}>{epic ? 'Save' : 'Create epic'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
