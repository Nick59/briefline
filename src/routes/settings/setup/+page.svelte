<script lang="ts">
	import { DocsPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Setup · Settings · Briefline</title></svelte:head>
<DocsPage origin={data.origin} operations={data.operations} tokenRequired={data.tokenRequired} />
