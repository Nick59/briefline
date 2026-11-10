<script lang="ts">
	import { SettingsPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Settings · Briefline</title></svelte:head>
<SettingsPage profile={data.profile} />
