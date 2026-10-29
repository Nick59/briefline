<script lang="ts">
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import type { SpecSummary } from '#lib/shared/domain/types.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import SpecKindBadge from './SpecKindBadge.svelte';

	interface Props {
		spec: SpecSummary;
		href: string;
		active?: boolean;
		owner?: string | null;
	}

	let { spec, href, active = false, owner }: Props = $props();
</script>

<a
	{href}
	data-sveltekit-reset="false"
	data-sveltekit-replacestate="true"
	aria-current={active ? 'true' : undefined}
	class={cn(
		'flex flex-col gap-1 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent',
		active && 'bg-accent'
	)}
>
	<span class="flex items-center gap-2">
		<SpecKindBadge kind={spec.kind} />
		<span class="truncate font-medium">{spec.title}</span>
	</span>
	<span class="flex items-center gap-2 text-[11px] text-muted-foreground">
		{#if owner}<span class="font-mono">{owner}</span>{/if}
		{#if spec.hasBrief}
			<span class="inline-flex items-center gap-1 text-brand"
				><SparklesIcon class="size-3" />Brief ready</span
			>
		{/if}
	</span>
</a>
