<script lang="ts">
	import type { StatusCounts } from '#lib/shared/domain/types.ts';
	import { cn } from '#lib/shared/lib/utils.ts';

	interface Props {
		counts: StatusCounts;
		label?: string;
		class?: string;
	}

	let { counts, label, class: className }: Props = $props();
	const share = (n: number) => (counts.total ? (n / counts.total) * 100 : 0);
</script>

<div
	class={cn('flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-muted', className)}
	role="img"
	aria-label={label ??
		`${counts.done} done, ${counts.in_progress} in progress, ${counts.todo} to do`}
>
	<div
		class="bg-status-done transition-[width] duration-(--duration-base)"
		style:width="{share(counts.done)}%"
	></div>
	<div
		class="bg-status-in-progress transition-[width] duration-(--duration-base)"
		style:width="{share(counts.in_progress)}%"
	></div>
</div>
