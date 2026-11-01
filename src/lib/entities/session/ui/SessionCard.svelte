<script lang="ts">
	import { resolve } from '$app/paths';
	import type { SessionSummary } from '#lib/shared/domain/types.ts';
	import { summaryPreview } from '../lib/session-view.ts';
	import SessionMeta from './SessionMeta.svelte';

	let { session }: { session: SessionSummary } = $props();
</script>

<li class="relative space-y-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/30">
	<SessionMeta {session} />
	{#if session.summary}
		<p class="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">
			{summaryPreview(session.summary)}
		</p>
	{/if}
	<a
		href={resolve('/sessions/[id]', { id: session.id })}
		class="text-sm font-medium underline-offset-2 after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
		>Open session</a
	>
</li>
