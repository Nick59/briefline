<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { page } from '$app/state';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import type { MarkdownExtension } from '#lib/shared/ui/markdown/index.ts';
	import type { Spec, SpecSummary } from '#lib/shared/domain/types.ts';
	import { SpecListItem } from '#lib/entities/spec/index.ts';
	import { SpecEditorDialog } from '#lib/features/spec-editor/index.ts';
	import SpecViewer from './SpecViewer.svelte';

	interface Props {
		specs: SpecSummary[];
		selected: Spec | null;
		owner: { type: 'epic' | 'task'; id: string };
		/** Labels such as task keys, for specs that belong to another owner. */
		ownerLabel?: (spec: SpecSummary) => string | null;
		/** Extra markdown extensions for this panel's viewer. */
		extensions?: MarkdownExtension[];
	}

	let { specs, selected, owner, ownerLabel = () => null, extensions = [] }: Props = $props();

	function hrefFor(spec: SpecSummary) {
		const url = new URL(page.url.href);
		url.searchParams.set('spec', spec.id);
		return `${url.pathname}${url.search}#specs`;
	}
</script>

<Section title="Specs" count={specs.length}>
	{#snippet actions()}
		<SpecEditorDialog {owner}>
			{#snippet trigger({ props })}
				<Button {...props} variant="ghost" size="xs"><PlusIcon />Spec</Button>
			{/snippet}
		</SpecEditorDialog>
	{/snippet}

	{#if specs.length === 0}
		<EmptyState
			title="No specs yet"
			description="Agents attach their specs and plans here as markdown. You get a plain-language brief for each."
		>
			{#snippet icon()}<FileTextIcon />{/snippet}
		</EmptyState>
	{:else}
		<div id="specs" class="grid gap-6 rounded-xl border bg-card p-4 md:grid-cols-[15rem_1fr]">
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
					/>
				{/key}
			{/if}
		</div>
	{/if}
</Section>
