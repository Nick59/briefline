<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import { openQuickJump } from '../model/state.svelte.ts';

	let { onclick }: { onclick?: () => void } = $props();

	const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent);
</script>

<button
	type="button"
	onclick={() => {
		onclick?.();
		openQuickJump();
	}}
	aria-keyshortcuts="Control+K Meta+K"
	class="flex w-full items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
>
	<SearchIcon class="size-4" />
	<span class="flex-1 text-left">Jump to ticket</span>
	<kbd class="rounded border bg-muted px-1.5 font-mono text-[10px]">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
</button>
