<script lang="ts">
	import mark from '#lib/assets/favicon.svg';

	let { compact = false }: { compact?: boolean } = $props();
</script>

<span class="inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap">
	<img src={mark} alt="" width={compact ? 26 : 34} height={compact ? 26 : 34} />
	<span class="text-lg font-semibold tracking-tight">Briefline</span>
</span>
