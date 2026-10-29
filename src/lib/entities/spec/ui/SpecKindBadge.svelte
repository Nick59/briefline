<script lang="ts">
	import { SPEC_KIND_LABELS, type SpecKind } from '#lib/shared/domain/constants.ts';

	let { kind }: { kind: SpecKind } = $props();
</script>

<span
	class="rounded border px-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
	>{SPEC_KIND_LABELS[kind]}</span
>
