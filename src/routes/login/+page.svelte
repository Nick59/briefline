<script lang="ts">
	import { LoginPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Sign in · Briefline</title></svelte:head>
<LoginPage next={data.next} error={form?.error} />
