<script lang="ts">
	import { SessionsPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Sessions · Briefline</title></svelte:head>
<SessionsPage sessions={data.sessions} actors={data.actors} filters={data.filters} />
