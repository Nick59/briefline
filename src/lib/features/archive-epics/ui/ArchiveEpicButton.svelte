<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import { displayKey } from '#lib/shared/domain/display-key.ts';
	import type { Epic } from '#lib/shared/domain/types.ts';
	import { pluralize } from '#lib/shared/lib/format.ts';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';

	let { epic, openTasks }: { epic: Epic; openTasks: number } = $props();

	let open = $state(false);
	let busy = $state(false);

	async function archive() {
		busy = true;
		const outcome = await runOperation(
			'update_epic',
			{ epic: epic.id, archived: true, force: openTasks > 0 },
			{ success: `Archived ${displayKey(epic)}` }
		);
		busy = false;
		if (outcome.ok) open = false;
	}
</script>

{#if openTasks === 0}
	<Button variant="outline" size="sm" disabled={busy} onclick={archive}>
		<ArchiveIcon />Archive
	</Button>
{:else}
	<Dialog.Root bind:open>
		<Dialog.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="sm"><ArchiveIcon />Archive</Button>
			{/snippet}
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>Archive {displayKey(epic)}?</Dialog.Title>
				<Dialog.Description>
					{pluralize(openTasks, 'unfinished task')} will be cancelled (reason: Epic archived). You can
					restore the epic later, but its tasks stay cancelled.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Keep epic</Button>
				<Button variant="destructive" disabled={busy} onclick={archive}>
					Cancel tasks and archive
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
