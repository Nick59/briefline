<script lang="ts">
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { goto } from '$app/navigation';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { ConfirmAction } from '#lib/shared/ui/confirm-action/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';

	interface Props {
		operation: 'delete_project' | 'delete_epic' | 'delete_phase' | 'delete_task' | 'delete_spec';
		input: Record<string, string>;
		what: string;
		consequence: string;
		/** Where to go after deleting; stays on the page when omitted. */
		redirectTo?: string;
		label?: string;
	}

	let { operation, input, what, consequence, redirectTo, label }: Props = $props();

	async function remove() {
		const outcome = await runOperation(operation, input, {
			success: `Deleted ${what}`,
			refresh: !redirectTo
		});
		if (outcome.ok && redirectTo) await goto(redirectTo, { refreshAll: true });
	}
</script>

<ConfirmAction title="Delete {what}?" description={consequence} onconfirm={remove}>
	{#snippet trigger({ props })}
		<Button
			{...props}
			variant="ghost"
			size={label ? 'sm' : 'icon-sm'}
			class="text-muted-foreground hover:text-danger"
			aria-label="Delete {what}"
		>
			<Trash2Icon />{label}
		</Button>
	{/snippet}
</ConfirmAction>
