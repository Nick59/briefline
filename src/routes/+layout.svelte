<script lang="ts">
	import './layout.css';
	import { ModeWatcher } from 'mode-watcher';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { Toaster } from '#lib/shared/ui/primitives/sonner/index.js';
	import { TooltipProvider } from '#lib/shared/ui/primitives/tooltip/index.js';
	import { AppShell } from '#lib/widgets/app-shell/index.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={favicon} />
	<meta name="application-name" content="Briefline" />
	<meta
		name="description"
		content="Track what AI agents plan and ship, with clear specs, progress, and human briefs."
	/>
</svelte:head>

<ModeWatcher />
<Toaster richColors position="bottom-right" />

<TooltipProvider>
	{#if page.url.pathname === '/login'}
		{@render children()}
	{:else}
		<AppShell
			projects={data.projects}
			activeProjectKey={data.activeProjectKey}
			activeEpics={data.activeEpics}
		>
			{@render children()}
		</AppShell>
	{/if}
</TooltipProvider>
