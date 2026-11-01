<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleHelpIcon from '@lucide/svelte/icons/circle-help';
	import { pluralize } from '#lib/shared/lib/format.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';

	let {
		openQuestions,
		questionCount,
		onclick,
		compact = false
	}: {
		openQuestions: number;
		questionCount: number;
		onclick?: () => void;
		compact?: boolean;
	} = $props();

	const ready = $derived(openQuestions === 0);
	const label = $derived(
		ready
			? questionCount === 1
				? 'The thread was answered or ignored'
				: `All ${questionCount} threads answered or ignored`
			: pluralize(openQuestions, 'open thread')
	);
	const name = $derived(ready ? 'Ready' : 'Not ready');
	const compactLabel = $derived(`Not ready: ${pluralize(openQuestions, 'open thread')}`);
</script>

{#if compact}
	{#if openQuestions > 0}
		<span title={compactLabel} aria-label={compactLabel} role="img" class="ml-auto shrink-0">
			<CircleHelpIcon class="size-3.5 text-danger" />
		</span>
	{/if}
{:else if questionCount > 0}
	{#snippet badge()}
		<ToneBadge tone={ready ? 'success' : 'danger'}>
			{#if ready}<CircleCheckIcon class="size-3" />{:else}<CircleHelpIcon
					class="size-3"
				/>{/if}{name}
		</ToneBadge>
	{/snippet}
	{#if onclick}
		<button
			type="button"
			{onclick}
			title={label}
			aria-label="{name}, {label}"
			class="shrink-0 cursor-pointer rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			{@render badge()}
		</button>
	{:else}
		<span title={label} class="shrink-0">{@render badge()}</span>
	{/if}
{/if}
