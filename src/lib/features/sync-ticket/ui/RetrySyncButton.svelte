<script lang="ts">
	import RotateIcon from '@lucide/svelte/icons/rotate-ccw';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';

	let { jobId }: { jobId: string } = $props();
	let busy = $state(false);
</script>

<Button
	variant="ghost"
	size="icon-xs"
	aria-label="Retry"
	disabled={busy}
	onclick={async () => {
		busy = true;
		await runOperation('retry_sync_job', { job: jobId }, { success: 'Retried' });
		busy = false;
	}}
>
	<RotateIcon />
</Button>
