<script lang="ts">
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import { displayKey } from '#lib/shared/domain/display-key.ts';
	import type { Epic } from '#lib/shared/domain/types.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';

	let { epic }: { epic: Epic } = $props();

	let busy = $state(false);

	async function restore() {
		busy = true;
		await runOperation(
			'update_epic',
			{ epic: epic.id, archived: false },
			{ success: `Restored ${displayKey(epic)}` }
		);
		busy = false;
	}
</script>

<Button variant="outline" size="sm" disabled={busy} onclick={restore}>
	<RotateCcwIcon />Restore
</Button>
