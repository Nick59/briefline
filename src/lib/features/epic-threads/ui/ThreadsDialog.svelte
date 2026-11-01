<script lang="ts">
	import { tick } from 'svelte';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import MessagesSquareIcon from '@lucide/svelte/icons/messages-square';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { toneClasses } from '#lib/shared/config/tokens/index.ts';
	import { pluralize } from '#lib/shared/lib/format.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import type { EpicQuestion } from '#lib/shared/domain/types.ts';
	import ThreadList from './ThreadList.svelte';
	import ThreadDetail from './ThreadDetail.svelte';

	interface Props {
		threads: EpicQuestion[];
		open?: boolean;
		/** A thread to show on opening. */
		focus?: string | null;
	}

	let { threads, open = $bindable(false), focus = $bindable(null) }: Props = $props();

	let selectedId = $state<string | null>(null);
	let listPane = $state<HTMLElement | null>(null);

	async function backToList() {
		selectedId = null;
		focus = null;
		await tick();
		listPane?.focus();
	}

	// Open threads first, each group keeping the order they were raised in.
	const sorted = $derived([
		...threads.filter((t) => t.status === 'open'),
		...threads.filter((t) => t.status !== 'open')
	]);
	const openCount = $derived(threads.filter((t) => t.status === 'open').length);
	const selected = $derived(threads.find((t) => t.id === selectedId) ?? null);

	$effect(() => {
		if (focus && threads.some((t) => t.id === focus)) selectedId = focus;
		else if (focus) focus = null;
	});
	$effect(() => {
		if (!open) {
			selectedId = null;
			focus = null;
		}
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				size="sm"
				title={threads.length
					? `${pluralize(openCount, 'open thread')} of ${threads.length}`
					: 'No threads'}
				class={cn(openCount > 0 && [toneClasses.danger.border, toneClasses.danger.text])}
			>
				<MessagesSquareIcon />Threads{threads.length ? ` · ${openCount}/${threads.length}` : ' · 0'}
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content
		class="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-xl"
	>
		<Dialog.Header class="pr-10">
			<Dialog.Title>Threads</Dialog.Title>
			<Dialog.Description>
				Questions and decisions for this epic. Agents and people reply over time. Tasks can't start
				while any thread is open.
			</Dialog.Description>
		</Dialog.Header>
		<div
			bind:this={listPane}
			tabindex="-1"
			class="min-h-0 overflow-y-auto overscroll-contain outline-none"
		>
			{#if selected}
				{#key selected.id}
					<ThreadDetail thread={selected} onback={() => (selectedId = null)} ondone={backToList} />
				{/key}
			{:else if threads.length}
				{#if openCount === 0}
					<p class="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
						<CircleCheckIcon class="size-4 text-success" />All threads are resolved. Tasks can be
						started.
					</p>
				{/if}
				<ThreadList threads={sorted} onselect={(t) => (selectedId = t.id)} highlight={focus} />
			{:else}
				<p class="py-6 text-center text-muted-foreground">
					No threads yet. Agents open one when something is unclear; you can too.
				</p>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
