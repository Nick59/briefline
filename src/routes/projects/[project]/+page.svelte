<script lang="ts">
	import { ProjectPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.project.name} · project/ai</title></svelte:head>
<ProjectPage
	project={data.project}
	epics={data.epics}
	activity={data.activity}
	syncJobs={data.syncJobs}
/>
