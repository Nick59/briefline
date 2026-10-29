<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import type { ExternalRef } from '#lib/shared/domain/types.ts';

	interface Props {
		target: { type: 'epic' | 'task'; id: string };
		current: ExternalRef | null;
		defaultProvider: string | null;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { target, current, defaultProvider, trigger }: Props = $props();

	let open = $state(false);
	let provider = $state('');
	let key = $state('');
	let url = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open) {
			provider = current?.provider ?? defaultProvider ?? '';
			key = current?.key ?? '';
			url = current?.url ?? '';
		}
	});

	async function save(externalRef: ExternalRef | null) {
		busy = true;
		const op = target.type === 'epic' ? 'update_epic' : 'update_task';
		const outcome = await runOperation(
			op,
			{ [target.type]: target.id, externalRef },
			{ success: externalRef ? 'Ticket linked' : 'Ticket unlinked' }
		);
		busy = false;
		if (outcome.ok) open = false;
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void save({ provider: provider.trim(), key: key.trim(), url: url.trim() || null });
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props })}
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-md">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>External ticket</Dialog.Title>
				<Dialog.Description>
					Optional. When the project's ticket sync uses the same provider, progress here updates
					that ticket.
				</Dialog.Description>
			</Dialog.Header>
			<div class="grid grid-cols-[8rem_1fr] gap-3">
				<Field label="Provider" for="ticket-provider"
					><Input id="ticket-provider" bind:value={provider} required placeholder="jira" /></Field
				>
				<Field label="Ticket key" for="ticket-key"
					><Input
						id="ticket-key"
						bind:value={key}
						required
						class="font-mono"
						placeholder="PROJ-123"
					/></Field
				>
			</div>
			<Field
				label="URL"
				for="ticket-url"
				hint="Leave empty to build it from the provider settings."
			>
				<Input id="ticket-url" type="url" bind:value={url} placeholder="https://…" />
			</Field>
			<Dialog.Footer class="sm:justify-between">
				{#if current}
					<Button
						type="button"
						variant="ghost"
						class="text-danger"
						disabled={busy}
						onclick={() => save(null)}>Unlink</Button
					>
				{/if}
				<div class="flex gap-2">
					<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
					<Button type="submit" disabled={busy || !provider || !key}>Save</Button>
				</div>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
