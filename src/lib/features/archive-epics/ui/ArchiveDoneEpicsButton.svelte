<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import { toast } from 'svelte-sonner';
	import type { EpicSummary } from '#lib/shared/domain/types.ts';
	import { pluralize } from '#lib/shared/lib/format.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';

	let { projectKey, count }: { projectKey: string; count: number } = $props();

	let busy = $state(false);

	async function archive() {
		busy = true;
		const outcome = await runOperation<{ archived: EpicSummary[] }>(
			'archive_done_epics',
			{ project: projectKey },
			{ refresh: false }
		);
		busy = false;
		if (outcome.ok) toast.success(`Archived ${pluralize(outcome.result.archived.length, 'epic')}`);
	}
</script>

<Button variant="outline" disabled={count === 0 || busy} onclick={archive}>
	<ArchiveIcon />Archive done epics
</Button>
