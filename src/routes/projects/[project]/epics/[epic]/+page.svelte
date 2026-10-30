<script lang="ts">
	import { displayKey } from '#lib/shared/domain/display-key.ts';
	import { EpicPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{displayKey(data.epic)} {data.epic.title} · Briefline</title></svelte:head>
<EpicPage
	project={data.project}
	epic={data.epic}
	selectedSpec={data.selectedSpec}
	activity={data.activity}
	syncJobs={data.syncJobs}
	ticketUrl={data.ticketUrl}
/>
