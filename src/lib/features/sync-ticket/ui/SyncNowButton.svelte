<script lang="ts">
	import RefreshIcon from '@lucide/svelte/icons/refresh-cw';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import type { SyncJob } from '#lib/shared/domain/types.ts';
	import { toast } from 'svelte-sonner';

	let { epicId }: { epicId: string } = $props();
	let busy = $state(false);

	async function sync() {
		busy = true;
		const outcome = await runOperation<SyncJob>('sync_epic_ticket', { epic: epicId });
		busy = false;
		if (!outcome.ok) return;
		if (outcome.result.status === 'succeeded') toast.success('Ticket updated');
		else toast.error(outcome.result.lastError ?? `Sync ${outcome.result.status}`);
	}
</script>

<Button variant="outline" size="sm" disabled={busy} onclick={sync}>
	<RefreshIcon class={cn(busy && 'animate-spin')} />Sync ticket
</Button>
