<script lang="ts">
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { cn } from '#lib/shared/lib/utils.ts';

	let { connectionId, name }: { connectionId: string; name: string } = $props();
	let busy = $state(false);

	async function test() {
		busy = true;
		const outcome = await runOperation<{ ok: boolean; message: string }>(
			'test_ticketing_connection',
			{ connection: connectionId },
			{ refresh: false }
		);
		busy = false;
		if (!outcome.ok) return;
		if (outcome.result.ok) toast.success(`${name}: ${outcome.result.message}`);
		else toast.error(`${name}: ${outcome.result.message}`);
	}
</script>

<Button variant="outline" size="sm" disabled={busy} onclick={test} aria-label="Test {name}">
	<ActivityIcon class={cn(busy && 'animate-pulse')} />Test
</Button>
