<script lang="ts">
	import { relativeTime } from '#lib/shared/lib/format.ts';

	let { value, class: className }: { value: string; class?: string } = $props();
</script>

<time datetime={value} title={new Date(value).toLocaleString()} class={className}
	>{relativeTime(value)}</time
>
