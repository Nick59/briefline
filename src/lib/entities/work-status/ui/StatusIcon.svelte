<script lang="ts">
	import type { WorkStatus } from '#lib/shared/domain/constants.ts';
	import { STATUS_LABELS } from '#lib/shared/domain/constants.ts';
	import { statusTone, toneVar, type Tone } from '#lib/shared/config/tokens/index.ts';

	interface Props {
		status: WorkStatus;
		/** Overrides the status color, e.g. with a stage tone. */
		tone?: Tone;
		size?: number;
		title?: string;
	}

	let { status, tone, size = 14, title }: Props = $props();
	const color = $derived(toneVar(tone ?? statusTone[status]));
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 16 16"
	class="shrink-0"
	role="img"
	aria-label={title ?? STATUS_LABELS[status]}
>
	<title>{title ?? STATUS_LABELS[status]}</title>
	{#if status === 'done'}
		<circle cx="8" cy="8" r="7" fill={color} />
		<path
			d="M4.8 8.2 7 10.3l4.2-4.6"
			fill="none"
			stroke="var(--card)"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{:else if status === 'in_progress'}
		<circle cx="8" cy="8" r="6.25" fill="none" stroke={color} stroke-width="1.5" />
		<path d="M8 4a4 4 0 0 1 0 8z" fill={color} />
	{:else}
		<circle
			cx="8"
			cy="8"
			r="6.25"
			fill="none"
			stroke={color}
			stroke-width="1.5"
			stroke-dasharray="2.2 1.8"
		/>
	{/if}
</svg>
