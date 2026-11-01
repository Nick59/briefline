<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import type { Spec, SpecSummary } from '#lib/shared/domain/types.ts';
	import { SpecEditorDialog } from '#lib/features/spec-editor/index.ts';
	import SpecBrowser from './SpecBrowser.svelte';

	interface Props {
		projectId: string;
		specs: SpecSummary[];
		selected: Spec | null;
	}

	let { projectId, specs, selected }: Props = $props();
	const owner = $derived({ type: 'project' as const, id: projectId });
</script>

<Dialog.Root>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm"><FileTextIcon />Specs · {specs.length}</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content
		class="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-6xl"
	>
		<Dialog.Header class="pr-10">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<Dialog.Title>Project specs</Dialog.Title>
				<SpecEditorDialog {owner}>
					{#snippet trigger({ props })}
						<Button {...props} variant="outline" size="sm"><PlusIcon />Add spec</Button>
					{/snippet}
				</SpecEditorDialog>
			</div>
			<Dialog.Description
				>Context that applies to every epic: architecture, conventions, product goals.</Dialog.Description
			>
		</Dialog.Header>
		<div class="min-h-0 overflow-y-auto overscroll-contain">
			{#if specs.length === 0}
				<EmptyState
					title="No project specs yet"
					description="Add architecture, conventions or product goals here. Agents read them before planning."
				>
					{#snippet icon()}<FileTextIcon />{/snippet}
				</EmptyState>
			{:else}
				<SpecBrowser {specs} {selected} {owner} />
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
