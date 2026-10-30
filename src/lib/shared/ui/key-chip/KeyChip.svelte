<script lang="ts">
	import { cn } from '#lib/shared/lib/utils.ts';

	let {
		value,
		title,
		class: className
	}: { value: string; title?: string; class?: string } = $props();
</script>

<span
	{title}
	class={cn('font-mono text-[11px] font-medium tracking-tight text-muted-foreground', className)}
	>{value}</span
>
