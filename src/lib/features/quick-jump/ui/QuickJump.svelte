<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Badge } from '#lib/shared/ui/primitives/badge/index.js';
	import { quickJump } from '../model/state.svelte.ts';
	import { readRecent, rememberRecent } from '../model/recent.ts';
	import type { TicketHit } from '../model/types.ts';

	const DEBOUNCE_MS = 120;
	const LISTBOX_ID = 'quick-jump-results';

	let query = $state('');
	let hits = $state<TicketHit[]>([]);
	let recent = $state<TicketHit[]>([]);
	let active = $state(0);
	let failed = $state(false);
	let settledQuery = $state('');

	const trimmed = $derived(query.trim());
	const items = $derived(trimmed ? hits : recent);
	const noMatch = $derived(
		trimmed !== '' && settledQuery === trimmed && !failed && hits.length === 0
	);

	function hrefOf(hit: TicketHit): string {
		if (hit.kind === 'project') return resolve('/projects/[project]', { project: hit.projectKey });
		if (hit.kind === 'epic')
			return resolve('/projects/[project]/epics/[epic]', {
				project: hit.projectKey,
				epic: hit.key
			});
		return resolve('/projects/[project]/epics/[epic]/tasks/[task]', {
			project: hit.projectKey,
			epic: hit.epicKey ?? '',
			task: hit.key
		});
	}

	async function search(text: string, signal?: AbortSignal): Promise<TicketHit[]> {
		const response = await fetch(`/quick-jump?query=${encodeURIComponent(text)}&limit=8`, {
			signal
		});
		if (!response.ok) throw new Error(String(response.status));
		return (await response.json()) as TicketHit[];
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			quickJump.open = !quickJump.open;
		}
	}

	$effect(() => {
		if (!quickJump.open) return;
		untrack(() => {
			query = '';
			hits = [];
			active = 0;
			failed = false;
			settledQuery = '';
			recent = readRecent();
		});
	});

	$effect(() => {
		const text = trimmed;
		if (!quickJump.open || !text) return;
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				hits = await search(text, controller.signal);
				failed = false;
				active = 0;
				settledQuery = text;
			} catch {
				if (controller.signal.aborted) return;
				failed = true;
				hits = [];
			}
		}, DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	$effect(() => {
		if (!quickJump.open) return;
		document.getElementById(`${LISTBOX_ID}-${active}`)?.scrollIntoView({ block: 'nearest' });
	});

	async function choose(hit: TicketHit | undefined) {
		if (!hit) return;
		rememberRecent(hit);
		quickJump.open = false;
		await goto(hrefOf(hit));
	}

	// Enter before the debounced results arrive must not act on the previous query's list.
	async function submit() {
		if (!trimmed || settledQuery === trimmed) return choose(items[active]);
		try {
			await choose((await search(trimmed))[0]);
		} catch {
			failed = true;
		}
	}

	function onInputKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (items.length === 0) return;
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + items.length) % items.length;
		} else if (event.key === 'Enter' && !event.isComposing) {
			event.preventDefault();
			void submit();
		}
	}

	const kindLabel = { task: 'Task', epic: 'Epic', project: 'Project' } as const;
</script>

<svelte:window onkeydown={onWindowKeydown} />

<Dialog.Root bind:open={quickJump.open}>
	<Dialog.Content
		showCloseButton={false}
		class="top-[20%] max-w-[calc(100%_-_2rem)] -translate-y-0 gap-0 p-0 sm:max-w-xl"
	>
		<Dialog.Title class="sr-only">Jump to ticket</Dialog.Title>
		<Dialog.Description class="sr-only">
			Type a task, epic or project key, a linked ticket number, or words from a title.
		</Dialog.Description>
		<input
			bind:value={query}
			onkeydown={onInputKeydown}
			type="text"
			role="combobox"
			aria-expanded={items.length > 0}
			aria-controls={LISTBOX_ID}
			aria-activedescendant={items.length > 0 ? `${LISTBOX_ID}-${active}` : undefined}
			aria-autocomplete="list"
			aria-label="Jump to ticket"
			placeholder="Key (SHOP-15), linked ticket, or title…"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			class="h-12 w-full rounded-t-xl border-b bg-transparent px-4 text-base outline-none placeholder:text-muted-foreground md:text-sm"
		/>
		<div class="max-h-[min(24rem,60dvh)] overflow-y-auto p-1.5">
			{#if !trimmed && items.length > 0}
				<p class="px-2 pt-1 pb-1.5 text-[11px] font-medium text-muted-foreground">Recent</p>
			{/if}
			<ul
				id={LISTBOX_ID}
				role="listbox"
				aria-label={trimmed ? 'Matching tickets' : 'Recent tickets'}
			>
				{#each items as hit, index (`${hit.kind}:${hit.key}`)}
					<li
						id={`${LISTBOX_ID}-${index}`}
						role="option"
						aria-selected={index === active}
						onmousemove={() => (active = index)}
						onclick={() => void choose(hit)}
						onkeydown={null}
						class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
					>
						<span class="w-[4.5rem] shrink-0 font-mono text-xs font-medium">{hit.key}</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate">{hit.title}</span>
							<span class="block truncate text-xs text-muted-foreground">
								{kindLabel[hit.kind]} · {hit.projectKey}{hit.epicTitle && hit.kind === 'task'
									? ` · ${hit.epicTitle}`
									: ''}
							</span>
						</span>
						{#if hit.externalKey}
							<Badge variant="outline" class="shrink-0 font-mono">{hit.externalKey}</Badge>
						{/if}
					</li>
				{/each}
			</ul>
			{#if noMatch}
				<p class="px-2 py-6 text-center text-sm text-muted-foreground" role="status">
					No ticket matches “{trimmed}”
				</p>
			{:else if failed}
				<p class="px-2 py-6 text-center text-sm text-destructive" role="alert">
					Search failed. Try again.
				</p>
			{:else if !trimmed && items.length === 0}
				<p class="px-2 py-6 text-center text-sm text-muted-foreground">
					Type a key like SHOP-15, or part of a title.
				</p>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
