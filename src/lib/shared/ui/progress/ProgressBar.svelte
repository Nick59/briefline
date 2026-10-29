<script lang="ts">
	import { toneClasses, type Tone } from '#lib/shared/config/tokens/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';

	interface Props {
		value: number;
		tone?: Tone;
		label?: string;
		class?: string;
	}

	let { value, tone = 'brand', label, class: className }: Props = $props();
	const clamped = $derived(Math.max(0, Math.min(100, value)));
</script>

<div
	class={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={clamped}
	aria-label={label}
>
	<div
		class={cn(
			'h-full rounded-full transition-[width] duration-(--duration-base) ease-(--ease-out)',
			toneClasses[tone].bg
		)}
		style:width="{clamped}%"
	></div>
</div>
