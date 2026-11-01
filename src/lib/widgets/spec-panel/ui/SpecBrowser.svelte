<script lang="ts">
	import { page } from '$app/state';
	import type { MarkdownExtension } from '#lib/shared/ui/markdown/index.ts';
	import type { Spec, SpecSummary } from '#lib/shared/domain/types.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { SpecListItem } from '#lib/entities/spec/index.ts';
	import SpecViewer from './SpecViewer.svelte';

	interface Props {
		specs: SpecSummary[];
		selected: Spec | null;
		owner: { type: 'project' | 'epic' | 'task'; id: string };
		/** Labels such as task keys, for specs that belong to another owner. */
		ownerLabel?: (spec: SpecSummary) => string | null;
		extensions?: MarkdownExtension[];
		hash?: string;
		id?: string;
		class?: string;
	}

	let {
		specs,
		selected,
		owner,
		ownerLabel = () => null,
		extensions = [],
		hash = '',
		id,
		class: className
	}: Props = $props();

	/** The spec is in the URL only when a person picked it or followed a link to it. */
	const chosen = $derived(page.url.searchParams.get('spec') === selected?.id);

	function hrefFor(spec: SpecSummary) {
		const url = new URL(page.url.href);
		url.searchParams.set('spec', spec.id);
		return `${url.pathname}${url.search}${hash}`;
	}
</script>

<div {id} class={cn('grid gap-6 md:grid-cols-[15rem_1fr]', className)}>
	<nav class="flex flex-col gap-0.5 md:border-r md:pr-3" aria-label="Specs">
		{#each specs as spec (spec.id)}
			<SpecListItem
				{spec}
				href={hrefFor(spec)}
				active={spec.id === selected?.id}
				owner={ownerLabel(spec)}
			/>
		{/each}
	</nav>
	{#if selected}
		{#key selected.id}
			<SpecViewer
				spec={selected}
				owner={selected.taskId ? { type: 'task', id: selected.taskId } : owner}
				{extensions}
				{chosen}
			/>
		{/key}
	{/if}
</div>
