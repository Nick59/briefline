<script lang="ts">
	import { ProjectSettingsPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Settings · {data.project.name}</title></svelte:head>
<ProjectSettingsPage project={data.project} providers={data.providers} />
