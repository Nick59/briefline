<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Textarea } from '#lib/shared/ui/primitives/textarea/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import type { Epic, EpicDetail } from '#lib/shared/domain/types.ts';

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
			const outcome = await runOperation<EpicDetail>(
				'create_epic',
				{ project: projectKey, ...fields },
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
	<Dialog.Content class="sm:max-w-2xl">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>{epic ? 'Edit epic' : 'New epic'}</Dialog.Title>
				<Dialog.Description>
					{epic
						? 'Update the outcome and the target date.'
						: 'An epic is a deliverable. Agents can fill it with tasks and specs.'}
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
			<Field
				label="Description (markdown)"
				for="epic-summary"
				hint="The outcome in plain language."
			>
				<Textarea
					id="epic-summary"
					bind:value={summary}
					maxlength={5000}
					rows={10}
					class="font-mono text-xs leading-relaxed"
				/>
			</Field>
			<Field label="Target date" for="epic-target">
				<Input id="epic-target" type="date" bind:value={targetDate} />
			</Field>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !title}>{epic ? 'Save' : 'Create epic'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
