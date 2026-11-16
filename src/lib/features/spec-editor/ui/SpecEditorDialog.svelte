<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MarkdownEditor } from '#lib/shared/ui/markdown-editor/index.ts';
	import type { EditorView } from '@codemirror/view';
	import {
		AddImageButton,
		imageCommand,
		imageUploadExtension,
		type ImageTarget
	} from '#lib/features/attachment-upload/index.ts';
	import { FormatToolbar } from '#lib/features/markdown-format/index.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import * as Tabs from '#lib/shared/ui/primitives/tabs/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { MarkdownViewer } from '#lib/shared/ui/markdown/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { SPEC_KINDS, SPEC_KIND_LABELS, type SpecKind } from '#lib/shared/domain/constants.ts';
	import type { Spec } from '#lib/shared/domain/types.ts';
	import { insertBlock, type DiagramTemplate } from '../model/diagram-templates.ts';
	import { diagramCommands } from '../model/diagram-commands.ts';
	import InsertDiagramMenu from './InsertDiagramMenu.svelte';

	type Owner = { type: 'project' | 'epic' | 'task'; id: string };

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
	let editor = $state<EditorView | null>(null);

	// A spec being created has no id yet, so its images go to the project.
	const imageTarget = $derived<ImageTarget | null>(
		spec
			? { type: 'spec', id: spec.id }
			: owner.type === 'project'
				? { type: 'project', id: owner.id }
				: page.params.project
					? { type: 'project', id: page.params.project }
					: null
	);

	function insertDiagram(template: DiagramTemplate) {
		// The editor does not exist on the Preview tab; the block then goes at the end.
		const text = editor ? editor.state.doc.toString() : content;
		const at = editor ? editor.state.selection.main.head : text.length;
		const result = insertBlock(text, at, template.source);
		if (editor) {
			const inserted = result.text.slice(at, at + result.text.length - text.length);
			editor.dispatch({
				changes: { from: at, insert: inserted },
				selection: { anchor: result.cursor },
				scrollIntoView: true
			});
			editor.focus();
		} else {
			content = result.text;
		}
		tab = 'write';
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
					`add_${owner.type}_spec`,
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
					<div class="flex items-center gap-1">
						{#if tab === 'write'}<FormatToolbar view={editor} />{/if}
						<AddImageButton view={editor} target={imageTarget} />
						<InsertDiagramMenu oninsert={insertDiagram} />
					</div>
				</div>
				<Tabs.Content value="write">
					<MarkdownEditor
						id="spec-content"
						bind:view={editor}
						bind:value={content}
						extensions={[imageUploadExtension(() => imageTarget)]}
						commands={[...diagramCommands, imageCommand(() => imageTarget)]}
						minRows={18}
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
