<script lang="ts">
	import './layout.css';
	import { onMount, untrack } from 'svelte';
	import { ModeWatcher } from 'mode-watcher';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { Toaster } from '#lib/shared/ui/primitives/sonner/index.js';
	import { TooltipProvider } from '#lib/shared/ui/primitives/tooltip/index.js';
	import { QuickJump } from '#lib/features/quick-jump/index.ts';
	import { ProfileDialog } from '#lib/features/user-profile/index.ts';
	import { AppShell } from '#lib/widgets/app-shell/index.ts';
	import { LiveActivity, provideLiveActivity } from '#lib/shared/lib/live-activity/index.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const live = new LiveActivity();
	provideLiveActivity(live);
	// Set during setup so the first paint, including the server render, shows the right agents.
	untrack(() => live.setPresence(data.presence));
	$effect.pre(() => live.setPresence(data.presence));

	const projectKey = $derived(data.activeProjectKey);
	const streaming = $derived(page.url.pathname !== '/login');

	const LATER_KEY = 'briefline.profile-later';
	let later = $state(false);

	onMount(() => {
		live.startPresenceClock();
		try {
			later = sessionStorage.getItem(LATER_KEY) === '1';
		} catch {
			// Storage can be blocked; the welcome modal then returns on every load.
		}
		return () => live.stopPresenceClock();
	});

	function postpone() {
		later = true;
		try {
			sessionStorage.setItem(LATER_KEY, '1');
		} catch {
			// Hidden for this page view only.
		}
	}

	const firstLaunch = $derived(data.profile === null);

	$effect(() => {
		if (!streaming) return;
		untrack(() => live.connect(projectKey));
		return () => live.disconnect();
	});
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
			profileName={data.profile?.name ?? null}
		>
			{@render children()}
		</AppShell>
		<QuickJump />
		<ProfileDialog
			open={firstLaunch && !later}
			profile={data.profile}
			onlater={postpone}
			onclose={postpone}
		/>
	{/if}
</TooltipProvider>
