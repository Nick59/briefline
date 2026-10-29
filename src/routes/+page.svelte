<script lang="ts">
	import { HomePage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Projects · project/ai</title></svelte:head>
<HomePage projects={data.projects} activity={data.activity} />
