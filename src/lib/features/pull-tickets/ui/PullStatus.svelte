<script lang="ts">
	import RefreshIcon from '@lucide/svelte/icons/refresh-cw';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { useLiveActivity } from '#lib/shared/lib/live-activity/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import type { PullStatus } from '#lib/shared/domain/pull-status.ts';
	import { pullLabel } from '../model.ts';

	let { projectId, initial }: { projectId: string; initial: PullStatus } = $props();

	const live = useLiveActivity();
	const status = $derived(live.pulls.get(projectId) ?? initial);
	const label = $derived(pullLabel(status, live.now));

	async function pull() {
		const outcome = await runOperation<PullStatus>(
			'pull_project_tickets',
			{ project: projectId },
			{ refresh: false }
		);
		if (outcome.ok) live.setPull(projectId, outcome.result);
	}
</script>

<div class="flex items-center gap-2 text-sm text-muted-foreground">
	<RefreshIcon class={cn('size-4 shrink-0', status.running && 'animate-spin')} aria-hidden="true" />
	<span class={cn(label.failed && 'text-destructive')} title={label.title ?? undefined}
		>{label.text}</span
	>
	<Button variant="outline" size="xs" disabled={status.running} onclick={pull}>Pull now</Button>
</div>
