<script lang="ts">
	import HandIcon from '@lucide/svelte/icons/hand';
	import LockOpenIcon from '@lucide/svelte/icons/lock-open';
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

	async function unblock() {
		busy = true;
		await runOperation(
			'update_task',
			{ task: task.id, blocked: false },
			{ success: `Unblocked ${displayKey(task)}` }
		);
		busy = false;
	}

	async function block(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const outcome = await runOperation(
			'update_task',
			{ task: task.id, blocked: true, blockReason: reason.trim() || undefined },
			{ success: `Blocked ${displayKey(task)}` }
		);
		busy = false;
		if (outcome.ok) {
			open = false;
			reason = '';
		}
	}
</script>

{#if task.blockedAt}
	<Button variant="outline" size="sm" disabled={busy} onclick={unblock}>
		<LockOpenIcon />Unblock
	</Button>
{:else if !task.cancelledAt}
	<Dialog.Root bind:open>
		<Dialog.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="sm"><HandIcon />Block task</Button>
			{/snippet}
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-md">
			<form class="grid gap-4" onsubmit={block}>
				<Dialog.Header>
					<Dialog.Title>Block {displayKey(task)}?</Dialog.Title>
					<Dialog.Description>
						Nobody can change the task's stages until you unblock it. Agents see it as not ready to
						start.
					</Dialog.Description>
				</Dialog.Header>
				<Field
					label="Reason"
					for="block-reason"
					hint="Optional. Shown on the task and in the activity log."
				>
					<Textarea id="block-reason" bind:value={reason} rows={3} maxlength={2000} />
				</Field>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
					<Button type="submit" disabled={busy}>Block task</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}
