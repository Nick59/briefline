<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const tabs = [
		{ href: resolve('/settings'), label: 'General' },
		{ href: resolve('/settings/ticketing'), label: 'Ticketing' },
		{ href: resolve('/settings/setup'), label: 'Setup' }
	];
</script>

<div class="max-w-5xl space-y-8">
	<PageHeader title="Settings" />
	<nav class="flex gap-1 border-b pb-2" aria-label="Settings">
		{#each tabs as tab (tab.href)}
			{@const active = page.url.pathname === tab.href}
			<a
				href={tab.href}
				aria-current={active ? 'page' : undefined}
				class={cn(
					'rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
					active && 'bg-muted font-medium text-foreground'
				)}>{tab.label}</a
			>
		{/each}
	</nav>
	{@render children()}
</div>
