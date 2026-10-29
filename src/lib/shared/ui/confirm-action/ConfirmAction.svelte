<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';

	interface Props {
		title: string;
		description: string;
		confirmLabel?: string;
		onconfirm: () => Promise<unknown>;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { title, description, confirmLabel = 'Delete', onconfirm, trigger }: Props = $props();
	let open = $state(false);
	let busy = $state(false);

	async function confirm() {
		busy = true;
		await onconfirm();
		busy = false;
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props })}
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button variant="destructive" disabled={busy} onclick={confirm}>{confirmLabel}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
