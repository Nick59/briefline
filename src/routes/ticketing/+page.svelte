<script lang="ts">
	import { TicketingPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Ticketing · Briefline</title></svelte:head>
<TicketingPage
	connections={data.connections}
	providers={data.providers}
	secretsAvailable={data.secretsAvailable}
/>
