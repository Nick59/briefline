<script lang="ts">
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';

	let { specId, hasBrief }: { specId: string; hasBrief: boolean } = $props();
	let busy = $state(false);

	async function translate() {
		busy = true;
		await runOperation('translate_spec', { spec: specId }, { success: 'Human brief ready' });
		busy = false;
	}
</script>

<Button variant={hasBrief ? 'outline' : 'default'} size="sm" disabled={busy} onclick={translate}>
	{#if busy}<LoaderIcon class="animate-spin" />{:else}<SparklesIcon />{/if}
	{hasBrief ? 'Regenerate brief' : 'Translate for humans'}
</Button>
