<script lang="ts">
	import { STAGES, STAGE_LABELS } from '#lib/shared/domain/constants.ts';
	import type { Progress } from '#lib/shared/domain/types.ts';
	import { SegmentedProgress } from '#lib/shared/ui/progress/index.ts';
	import { StageIcon } from '#lib/entities/work-status/index.ts';

	let { progress }: { progress: Progress } = $props();
</script>

<dl class="grid gap-2">
	{#each STAGES as stage (stage)}
		{@const counts = progress.stages[stage]}
		<div class="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3">
			<dt class="flex items-center gap-1.5 text-xs text-muted-foreground">
				<StageIcon {stage} class="size-3.5" />{STAGE_LABELS[stage]}
			</dt>
			<dd>
				<SegmentedProgress
					{counts}
					label="{STAGE_LABELS[stage]}: {counts.done} of {counts.total} done"
				/>
			</dd>
			<dd class="text-right font-mono text-[11px] text-muted-foreground tabular-nums">
				{counts.done}/{counts.total}
			</dd>
		</div>
	{/each}
</dl>
