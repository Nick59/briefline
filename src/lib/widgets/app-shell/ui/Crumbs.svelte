<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	let { items }: { items: { label: string; href?: string; mono?: boolean }[] } = $props();
</script>

<nav aria-label="Breadcrumb">
	<ol class="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
		{#each items as item, i (i)}
			<li class="flex items-center gap-1">
				{#if i > 0}<ChevronRightIcon class="size-3.5 opacity-60" aria-hidden="true" />{/if}
				{#if item.href}
					<a
						href={item.href}
						class="transition-colors hover:text-foreground {item.mono ? 'font-mono text-xs' : ''}"
						>{item.label}</a
					>
				{:else}
					<span aria-current="page" class={item.mono ? 'font-mono text-xs' : ''}>{item.label}</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
