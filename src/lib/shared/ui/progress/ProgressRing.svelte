<script lang="ts">
	import { toneVar, type Tone } from '#lib/shared/config/tokens/index.ts';

	interface Props {
		value: number;
		size?: number;
		stroke?: number;
		tone?: Tone;
		showLabel?: boolean;
	}

	let { value, size = 44, stroke = 4, tone = 'brand', showLabel = true }: Props = $props();
	const radius = $derived((size - stroke) / 2);
	const circumference = $derived(2 * Math.PI * radius);
	const offset = $derived(circumference * (1 - Math.max(0, Math.min(100, value)) / 100));
</script>

<div
	class="relative inline-grid shrink-0 place-items-center"
	style:width="{size}px"
	style:height="{size}px"
>
	<svg width={size} height={size} class="-rotate-90" aria-hidden="true">
		<circle
			cx={size / 2}
			cy={size / 2}
			r={radius}
			fill="none"
			stroke="var(--muted)"
			stroke-width={stroke}
		/>
		<circle
			cx={size / 2}
			cy={size / 2}
			r={radius}
			fill="none"
			stroke={toneVar(tone)}
			stroke-width={stroke}
			stroke-linecap="round"
			stroke-dasharray={circumference}
			stroke-dashoffset={offset}
			class="transition-[stroke-dashoffset] duration-(--duration-base) ease-(--ease-out)"
		/>
	</svg>
	{#if showLabel}
		<span class="absolute font-mono text-[11px] font-medium tabular-nums">{Math.round(value)}%</span
		>
	{/if}
</div>
