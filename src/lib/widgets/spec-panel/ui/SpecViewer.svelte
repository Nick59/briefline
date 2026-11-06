<script lang="ts">
	import { onMount } from 'svelte';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import FileCodeIcon from '@lucide/svelte/icons/file-code-2';
	import * as Tabs from '#lib/shared/ui/primitives/tabs/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import type { MarkdownExtension } from '#lib/shared/ui/markdown/index.ts';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { RelativeTime } from '#lib/shared/ui/relative-time/index.ts';
	import type { Spec } from '#lib/shared/domain/types.ts';
	import { markSpecViewed } from '#lib/shared/lib/mark-spec-viewed.ts';
	import { SpecBrief, SpecKindBadge } from '#lib/entities/spec/index.ts';
	import { SpecEditorDialog } from '#lib/features/spec-editor/index.ts';
	import { SpecHistory } from '#lib/features/spec-history/index.ts';
	import { SpecReadModeButton } from '#lib/features/spec-read-mode/index.ts';
	import { TranslateSpecButton } from '#lib/features/translate-spec/index.ts';
	import { DeleteButton } from '#lib/features/delete-entity/index.ts';

	interface Props {
		spec: Spec;
		owner: { type: 'project' | 'epic' | 'task'; id: string };
		extensions?: MarkdownExtension[];
		/** True when a person picked this spec; the one selected by default is not counted as opened. */
		chosen?: boolean;
	}

	let { spec, owner, extensions = [], chosen = false }: Props = $props();
	let view = $state<'brief' | 'source'>('brief');

	onMount(() => {
		if (chosen && !spec.viewedAt) void markSpecViewed(spec.id);
	});
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
			<SpecReadModeButton
				{spec}
				{extensions}
				bind:view
				onopen={() => {
					if (!spec.viewedAt) void markSpecViewed(spec.id);
				}}
			/>
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
			<SpecBrief {spec} {extensions}>
				{#snippet empty()}
					<EmptyState
						title="No human brief yet"
						description="Translate this spec into a short, plain-language brief: what changes, why, how we know it is done, and the risks."
					>
						{#snippet action()}<TranslateSpecButton specId={spec.id} hasBrief={false} />{/snippet}
					</EmptyState>
				{/snippet}
			</SpecBrief>
		</Tabs.Content>
		<Tabs.Content value="source" class="pt-3">
			<SpecHistory {spec} {extensions} />
		</Tabs.Content>
	</Tabs.Root>
</article>
