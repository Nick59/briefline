<script lang="ts">
	import { STATUS_LABELS, type WorkStatus } from '#lib/shared/domain/constants.ts';
	import { statusTone } from '#lib/shared/config/tokens/index.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';
	import StatusIcon from './StatusIcon.svelte';

	let { status, class: className }: { status: WorkStatus; class?: string } = $props();
</script>

<ToneBadge tone={statusTone[status]} class={className}>
	<StatusIcon {status} size={11} />
	{STATUS_LABELS[status]}
</ToneBadge>
