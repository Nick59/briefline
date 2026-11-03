<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import type { MarkdownExtension } from '#lib/shared/ui/markdown/index.ts';
	import type { Spec, SpecSummary } from '#lib/shared/domain/types.ts';
	import { SpecEditorDialog } from '#lib/features/spec-editor/index.ts';
	import SpecBrowser from './SpecBrowser.svelte';

	interface Props {
		specs: SpecSummary[];
		approval?: { approvedAt: string | null; approvedBy: string | null };
		selected: Spec | null;
		owner: { type: 'epic' | 'task'; id: string };
		/** Labels such as task keys, for specs that belong to another owner. */
		ownerLabel?: (spec: SpecSummary) => string | null;
		/** Extra markdown extensions for this panel's viewer. */
		extensions?: MarkdownExtension[];
	}

	let {
		specs,
		selected,
		owner,
		ownerLabel = () => null,
		extensions = [],
		approval
	}: Props = $props();
	let approving = $state(false);
	async function approve() {
		approving = true;
		try {
			await runOperation('approve_epic_specs', { epic: owner.id }, { success: 'Specs approved' });
		} finally {
			approving = false;
		}
	}
</script>

<Section title="Specs" count={specs.length}>
	{#snippet actions()}
		{#if approval}
			{#if approval.approvedAt}
				<span
					class="flex items-center gap-1 text-xs text-muted-foreground"
					title={`Approved by ${approval.approvedBy}`}
					><CheckIcon class="size-3.5" />Specs approved</span
				>
			{:else}
				<Button size="sm" onclick={approve} disabled={approving}
					><CheckIcon />{approving ? 'Approving…' : 'Approve specs'}</Button
				>
			{/if}
		{/if}
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
		<SpecBrowser
			id="specs"
			class="rounded-xl border bg-card p-4"
			hash="#specs"
			{specs}
			{selected}
			{owner}
			{ownerLabel}
			{extensions}
		/>
	{/if}
</Section>
