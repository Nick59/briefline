<script lang="ts">
	import { LoginPage } from '#lib/pages/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Sign in · project/ai</title></svelte:head>
<LoginPage next={data.next} error={form?.error} />
