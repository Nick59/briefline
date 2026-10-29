<script lang="ts">
	import { cn } from '#lib/shared/lib/utils.ts';

	let { value, class: className }: { value: string; class?: string } = $props();
</script>

<span
	class={cn('font-mono text-[11px] font-medium tracking-tight text-muted-foreground', className)}
	>{value}</span
>
