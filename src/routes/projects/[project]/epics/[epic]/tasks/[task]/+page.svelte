<script lang="ts">
	import { displayKey } from '#lib/shared/domain/display-key.ts';
	import { TaskPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{displayKey(data.task)} {data.task.title} · Briefline</title></svelte:head>
<TaskPage
	project={data.project}
	task={data.task}
	phases={data.phases}
	selectedSpec={data.selectedSpec}
	activity={data.activity}
	ticketUrl={data.ticketUrl}
/>
