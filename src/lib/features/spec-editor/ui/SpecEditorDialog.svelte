<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import * as Tabs from '#lib/shared/ui/primitives/tabs/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Textarea } from '#lib/shared/ui/primitives/textarea/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { MarkdownViewer } from '#lib/shared/ui/markdown/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { SPEC_KINDS, SPEC_KIND_LABELS, type SpecKind } from '#lib/shared/domain/constants.ts';
	import type { Spec } from '#lib/shared/domain/types.ts';
	import { insertBlock, type DiagramTemplate } from '../model/diagram-templates.ts';
	import InsertDiagramMenu from './InsertDiagramMenu.svelte';

	type Owner = { type: 'epic'; id: string } | { type: 'task'; id: string };

	interface Props {
		owner: Owner;
		/** Edit this spec instead of creating one. */
		spec?: Spec;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { owner, spec, trigger }: Props = $props();

	let open = $state(false);
	let title = $state('');
	let kind = $state<SpecKind>('spec');
	let content = $state('');
	let busy = $state(false);
	let tab = $state('write');
	let editor = $state<HTMLTextAreaElement | null>(null);

	async function insertDiagram(template: DiagramTemplate) {
		const cursor = editor?.selectionStart ?? content.length;
		const result = insertBlock(content, cursor, template.source);
		content = result.text;
		tab = 'write';
		await tick();
		editor?.focus();
		editor?.setSelectionRange(result.cursor, result.cursor);
	}

	$effect(() => {
		if (open) {
			title = spec?.title ?? '';
			kind = spec?.kind ?? 'spec';
			content = spec?.content ?? '';
		}
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const fields = { title, kind, content };
		const outcome = spec
			? await runOperation<Spec>(
					'update_spec',
					{ spec: spec.id, ...fields },
					{ success: 'Spec saved' }
				)
			: await runOperation<Spec>(
					owner.type === 'epic' ? 'add_epic_spec' : 'add_task_spec',
					{ [owner.type]: owner.id, ...fields },
					{ success: 'Spec added', refresh: false }
				);
		busy = false;
		if (!outcome.ok) return;
		open = false;
		if (!spec) {
			const url = new URL(page.url.href);
			url.searchParams.set('spec', outcome.result.id);
			await goto(url, { reset: false, refreshAll: true });
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props })}
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-4xl">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>{spec ? 'Edit spec' : 'Add spec'}</Dialog.Title>
				<Dialog.Description
					>Markdown written by you or by an agent. Editing the content clears the human brief.</Dialog.Description
				>
			</Dialog.Header>
			<div class="grid gap-3 sm:grid-cols-[1fr_10rem]">
				<Field label="Title" for="spec-title"
					><Input id="spec-title" bind:value={title} required maxlength={200} /></Field
				>
				<Field label="Kind" for="spec-kind">
					<ChoiceSelect
						id="spec-kind"
						bind:value={kind}
						options={SPEC_KINDS.map((k) => ({ value: k, label: SPEC_KIND_LABELS[k] }))}
					/>
				</Field>
			</div>
			<Tabs.Root bind:value={tab}>
				<div class="flex items-center justify-between gap-2">
					<Tabs.List>
						<Tabs.Trigger value="write">Write</Tabs.Trigger>
						<Tabs.Trigger value="preview">Preview</Tabs.Trigger>
					</Tabs.List>
					<InsertDiagramMenu oninsert={insertDiagram} />
				</div>
				<Tabs.Content value="write">
					<Textarea
						bind:ref={editor}
						bind:value={content}
						rows={18}
						class="font-mono text-xs leading-relaxed"
						aria-label="Markdown content"
					/>
				</Tabs.Content>
				<Tabs.Content value="preview" class="max-h-[26rem] overflow-y-auto rounded-md border p-4">
					<MarkdownViewer source={content || '_Nothing to preview yet._'} />
				</Tabs.Content>
			</Tabs.Root>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !title}>{spec ? 'Save' : 'Add spec'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
