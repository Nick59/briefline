<script lang="ts">
	import { EpicPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.epic.key} {data.epic.title} · Briefline</title></svelte:head>
<EpicPage
	project={data.project}
	epic={data.epic}
	selectedSpec={data.selectedSpec}
	activity={data.activity}
	syncJobs={data.syncJobs}
	ticketUrl={data.ticketUrl}
/>
