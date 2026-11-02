<script lang="ts">
	import BanIcon from '@lucide/svelte/icons/ban';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import { displayKey } from '#lib/shared/domain/display-key.ts';
	import type { Task } from '#lib/shared/domain/types.ts';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Textarea } from '#lib/shared/ui/primitives/textarea/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';

	let { task }: { task: Task } = $props();

	let open = $state(false);
	let reason = $state('');
	let busy = $state(false);

	async function restore() {
		busy = true;
		await runOperation(
			'update_task',
			{ task: task.id, cancelled: false },
			{ success: `Restored ${displayKey(task)}` }
		);
		busy = false;
	}

	async function cancel(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const outcome = await runOperation(
			'update_task',
			{ task: task.id, cancelled: true, cancelReason: reason.trim() || undefined },
			{ success: `Cancelled ${displayKey(task)}` }
		);
		busy = false;
		if (outcome.ok) {
			open = false;
			reason = '';
		}
	}
</script>

{#if task.cancelledAt}
	<Button variant="outline" size="sm" disabled={busy} onclick={restore}>
		<RotateCcwIcon />Restore task
	</Button>
{:else}
	<Dialog.Root bind:open>
		<Dialog.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="sm"><BanIcon />Cancel task</Button>
			{/snippet}
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-md">
			<form class="grid gap-4" onsubmit={cancel}>
				<Dialog.Header>
					<Dialog.Title>Cancel {displayKey(task)}?</Dialog.Title>
					<Dialog.Description>
						The task stays on the board but no longer counts in epic or project progress. You can
						restore it later.
					</Dialog.Description>
				</Dialog.Header>
				<Field label="Reason" for="cancel-reason" hint="Optional. Recorded in the activity log.">
					<Textarea id="cancel-reason" bind:value={reason} rows={3} maxlength={2000} />
				</Field>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (open = false)}>Keep task</Button>
					<Button type="submit" variant="destructive" disabled={busy}>Cancel task</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}
