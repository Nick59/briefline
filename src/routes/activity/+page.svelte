<script lang="ts">
	import { ActivityPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Activity · Briefline</title></svelte:head>
<ActivityPage
	projects={data.projects}
	activity={data.activity}
	filters={data.filters}
	actors={data.actors}
/>
