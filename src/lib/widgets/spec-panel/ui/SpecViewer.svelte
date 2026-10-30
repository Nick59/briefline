<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import FileCodeIcon from '@lucide/svelte/icons/file-code-2';
	import * as Tabs from '#lib/shared/ui/primitives/tabs/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { MarkdownViewer, type MarkdownExtension } from '#lib/shared/ui/markdown/index.ts';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { RelativeTime } from '#lib/shared/ui/relative-time/index.ts';
	import type { Spec } from '#lib/shared/domain/types.ts';
	import { HumanBrief, SpecKindBadge } from '#lib/entities/spec/index.ts';
	import { SpecEditorDialog } from '#lib/features/spec-editor/index.ts';
	import { SpecReadModeButton } from '#lib/features/spec-read-mode/index.ts';
	import { TranslateSpecButton } from '#lib/features/translate-spec/index.ts';
	import { DeleteButton } from '#lib/features/delete-entity/index.ts';

	interface Props {
		spec: Spec;
		owner: { type: 'epic' | 'task'; id: string };
		extensions?: MarkdownExtension[];
	}

	let { spec, owner, extensions = [] }: Props = $props();
	let view = $state<'brief' | 'source'>('brief');

	/** Diagrams from the spec, shown with the brief because they are often the clearest part for humans. */
	const diagrams = $derived(
		[...spec.content.matchAll(/^```mermaid[^\n]*\n[\s\S]*?^```/gm)]
			.map((match) => match[0])
			.join('\n\n')
	);
</script>

<article class="min-w-0 space-y-4">
	<header class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 space-y-1">
			<div class="flex items-center gap-2">
				<SpecKindBadge kind={spec.kind} /><span class="text-xs text-muted-foreground"
					>Updated <RelativeTime value={spec.updatedAt} /></span
				>
			</div>
			<h3 class="text-lg font-semibold tracking-tight">{spec.title}</h3>
		</div>
		<div class="flex items-center gap-1">
			<SpecReadModeButton {spec} {extensions} />
			<TranslateSpecButton specId={spec.id} hasBrief={spec.brief !== null} />
			<SpecEditorDialog {owner} {spec}>
				{#snippet trigger({ props })}
					<Button {...props} variant="ghost" size="icon-sm" aria-label="Edit spec"
						><PencilIcon /></Button
					>
				{/snippet}
			</SpecEditorDialog>
			<DeleteButton
				operation="delete_spec"
				input={{ spec: spec.id }}
				what="spec “{spec.title}”"
				consequence="The markdown and its human brief are removed."
			/>
		</div>
	</header>

	<Tabs.Root bind:value={view}>
		<Tabs.List>
			<Tabs.Trigger value="brief"><SparklesIcon />Human brief</Tabs.Trigger>
			<Tabs.Trigger value="source"><FileCodeIcon />AI source</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="brief" class="pt-3">
			{#if spec.brief}
				<HumanBrief brief={spec.brief} />
			{:else}
				<EmptyState
					title="No human brief yet"
					description="Translate this spec into a short, plain-language brief: what changes, why, how we know it is done, and the risks."
				>
					{#snippet action()}<TranslateSpecButton specId={spec.id} hasBrief={false} />{/snippet}
				</EmptyState>
			{/if}
			{#if diagrams}
				<section class="mt-6 space-y-2">
					<h4 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
						Diagrams
					</h4>
					<MarkdownViewer source={diagrams} {extensions} />
				</section>
			{/if}
		</Tabs.Content>
		<Tabs.Content value="source" class="pt-3">
			<MarkdownViewer source={spec.content} {extensions} />
		</Tabs.Content>
	</Tabs.Root>
</article>
