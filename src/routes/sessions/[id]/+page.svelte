<script lang="ts">
	import { SessionPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Session · Briefline</title></svelte:head>
<SessionPage session={data.session} activity={data.activity} projects={data.projects} />
