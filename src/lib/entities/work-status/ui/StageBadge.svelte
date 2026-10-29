<script lang="ts">
	import { STAGE_LABELS, type Stage } from '#lib/shared/domain/constants.ts';
	import { stageTone } from '#lib/shared/config/tokens/index.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';

	let {
		stage,
		variant = 'soft',
		class: className
	}: { stage: Stage; variant?: 'soft' | 'outline' | 'dot'; class?: string } = $props();
</script>

<ToneBadge tone={stageTone[stage]} {variant} class={className}>{STAGE_LABELS[stage]}</ToneBadge>
