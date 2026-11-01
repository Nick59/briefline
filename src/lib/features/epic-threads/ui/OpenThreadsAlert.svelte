<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { toneClasses } from '#lib/shared/config/tokens/index.ts';
	import { pluralize } from '#lib/shared/lib/format.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';

	let { openThreads, onopen }: { openThreads: number; onopen: () => void } = $props();
</script>

{#if openThreads > 0}
	<div
		role="status"
		aria-label="Open threads"
		class={cn(
			'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center',
			toneClasses.danger.soft,
			toneClasses.danger.border
		)}
	>
		<CircleAlertIcon class="size-5 shrink-0" aria-hidden="true" />
		<div class="min-w-0 flex-1 space-y-0.5">
			<p class="font-semibold">{pluralize(openThreads, 'open thread')} — tasks can't start</p>
			<p class="text-sm text-foreground/80">
				Answer or ignore them before any task in this epic moves to In progress.
			</p>
		</div>
		<Button size="sm" onclick={onopen} class="shrink-0">Open threads</Button>
	</div>
{/if}
