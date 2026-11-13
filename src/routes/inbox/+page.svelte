<script lang="ts">
	import { InboxPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Inbox · Briefline</title></svelte:head>
<InboxPage items={data.inbox} />
