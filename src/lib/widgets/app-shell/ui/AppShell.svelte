<script lang="ts">
	import type { Snippet } from 'svelte';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import PlugIcon from '@lucide/svelte/icons/plug';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { EpicSummary, ProjectSummary } from '#lib/shared/domain/types.ts';
	import * as Sheet from '#lib/shared/ui/primitives/sheet/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { ThemeToggle } from '#lib/features/theme-toggle/index.ts';
	import ProjectNav from './ProjectNav.svelte';

	interface Props {
		projects: ProjectSummary[];
		activeProjectKey: string | null;
		activeEpics: EpicSummary[];
		children: Snippet;
	}

	let { projects, activeProjectKey, activeEpics, children }: Props = $props();
	let mobileOpen = $state(false);

	const links = [
		{
			href: resolve('/'),
			label: 'Overview',
			icon: LayoutGridIcon,
			match: (p: string) => p === '/'
		},
		{
			href: resolve('/docs'),
			label: 'API & MCP',
			icon: PlugIcon,
			match: (p: string) => p.startsWith('/docs')
		}
	];
</script>

{#snippet sidebar(onnavigate?: () => void)}
	<div class="flex h-full flex-col gap-5 p-3">
		<a
			href={resolve('/')}
			onclick={onnavigate}
			class="flex items-center gap-2 px-2 pt-1 font-mono text-sm font-semibold tracking-tight"
		>
			<span
				class="grid size-6 place-items-center rounded-md bg-foreground text-[10px] text-background"
				>pm</span
			>
			<span>project<span class="text-muted-foreground">/</span>ai</span>
		</a>
		<nav class="space-y-0.5" aria-label="Main">
			{#each links as link (link.href)}
				{@const active = link.match(page.url.pathname)}
				<a
					href={link.href}
					onclick={onnavigate}
					aria-current={active ? 'page' : undefined}
					class={cn(
						'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
						active && 'bg-sidebar-accent text-foreground'
					)}
				>
					<link.icon class="size-4" />{link.label}
				</a>
			{/each}
		</nav>
		<div class="min-h-0 flex-1 overflow-y-auto">
			<ProjectNav {projects} {activeProjectKey} {activeEpics} {onnavigate} />
		</div>
		<div class="flex items-center justify-between border-t pt-3">
			<span class="px-2 text-[11px] text-muted-foreground">Theme</span>
			<ThemeToggle />
		</div>
	</div>
{/snippet}

<div class="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
	<aside class="sticky top-0 hidden h-dvh border-r bg-sidebar md:block" aria-label="Sidebar">
		{@render sidebar()}
	</aside>

	<div class="flex min-w-0 flex-col">
		<header
			class="sticky top-0 z-40 flex h-12 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur md:hidden"
		>
			<Sheet.Root bind:open={mobileOpen}>
				<Sheet.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon-sm" aria-label="Open navigation"
							><MenuIcon /></Button
						>
					{/snippet}
				</Sheet.Trigger>
				<Sheet.Content side="left" class="w-72 bg-sidebar p-0">
					<Sheet.Title class="sr-only">Navigation</Sheet.Title>
					{@render sidebar(() => (mobileOpen = false))}
				</Sheet.Content>
			</Sheet.Root>
			<span class="font-mono text-sm font-semibold"
				>project<span class="text-muted-foreground">/</span>ai</span
			>
		</header>
		<main class="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 md:px-8 md:py-8">
			{@render children()}
		</main>
	</div>
</div>
