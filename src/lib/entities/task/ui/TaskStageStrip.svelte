<script lang="ts">
	import { STAGES, STAGE_LABELS, STATUS_LABELS } from '#lib/shared/domain/constants.ts';
	import type { StageStatuses } from '#lib/shared/domain/types.ts';
	import { stageTone } from '#lib/shared/config/tokens/index.ts';
	import { StatusIcon } from '#lib/entities/work-status/index.ts';

	let { stages, size = 13 }: { stages: StageStatuses; size?: number } = $props();
</script>

<span class="inline-flex items-center gap-0.5" aria-label="Stage progress">
	{#each STAGES as stage (stage)}
		<StatusIcon
			status={stages[stage]}
			tone={stages[stage] === 'todo' ? undefined : stageTone[stage]}
			{size}
			title="{STAGE_LABELS[stage]}: {STATUS_LABELS[stages[stage]]}"
		/>
	{/each}
</span>
