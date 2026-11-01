<script lang="ts">
	import MessageSquarePlusIcon from '@lucide/svelte/icons/message-square-plus';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Textarea } from '#lib/shared/ui/primitives/textarea/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';

	let { epicId }: { epicId: string } = $props();

	let open = $state(false);
	let title = $state('');
	let details = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open) {
			title = '';
			details = '';
		}
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const outcome = await runOperation(
			'add_epic_questions',
			{
				epic: epicId,
				questions: [{ question: title.trim(), context: details.trim() || undefined }]
			},
			{ success: 'Thread opened' }
		);
		busy = false;
		if (outcome.ok) open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm"><MessageSquarePlusIcon />New thread</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-xl">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>New thread</Dialog.Title>
				<Dialog.Description>
					Raise a question or a decision. Agents read and reply to it; tasks can't start until it is
					answered or ignored.
				</Dialog.Description>
			</Dialog.Header>
			<Field label="Title" for="thread-title">
				<Input
					id="thread-title"
					bind:value={title}
					required
					maxlength={5000}
					placeholder="Should guests be able to check out?"
				/>
			</Field>
			<Field label="Details (markdown, optional)" for="thread-details">
				<Textarea id="thread-details" bind:value={details} maxlength={10000} rows={5} />
			</Field>
			<Dialog.Footer>
				<Button type="submit" disabled={busy || title.trim() === ''}>Open thread</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
