<script lang="ts">
	import TicketIcon from '@lucide/svelte/icons/ticket';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import type { ExternalRef } from '#lib/shared/domain/types.ts';

	let { ref, url }: { ref: ExternalRef; url: string | null } = $props();
</script>

{#snippet content()}
	<TicketIcon class="size-3.5 text-muted-foreground" />
	<span class="font-medium">{ref.provider}</span>
{/snippet}

{#if url}
	<a
		href={url}
		target="_blank"
		rel="noopener noreferrer"
		class="inline-flex h-6 items-center gap-1.5 rounded-md border bg-card px-2 text-xs transition-colors hover:bg-accent"
	>
		{@render content()}
		<ExternalLinkIcon class="size-3 text-muted-foreground" />
	</a>
{:else}
	<span class="inline-flex h-6 items-center gap-1.5 rounded-md border bg-card px-2 text-xs"
		>{@render content()}</span
	>
{/if}
