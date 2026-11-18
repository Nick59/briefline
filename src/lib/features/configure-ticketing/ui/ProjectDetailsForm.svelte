<script lang="ts">
	import { untrack } from 'svelte';
	import {
		AddImageButton,
		imageCommand,
		imageUploadExtension,
		type ImageTarget
	} from '#lib/features/attachment-upload/index.ts';
	import { FormatToolbar } from '#lib/features/markdown-format/index.ts';
	import { MarkdownEditor } from '#lib/shared/ui/markdown-editor/index.ts';
	import type { EditorView } from '@codemirror/view';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import type { Project } from '#lib/shared/domain/types.ts';

	let { project }: { project: Project } = $props();
	let name = $state('');
	let description = $state('');
	let busy = $state(false);
	let descriptionEl = $state<EditorView | null>(null);
	const imageTarget = $derived<ImageTarget>({ type: 'project', id: project.id });

	// Reset only when switching project; a reload of the same project keeps unsaved edits.
	$effect.pre(() => {
		void project.id;
		untrack(() => {
			name = project.name;
			description = project.description;
		});
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		await runOperation(
			'update_project',
			{ project: project.id, name, description },
			{ success: 'Project saved' }
		);
		busy = false;
	}
</script>

<form class="grid gap-4" onsubmit={submit}>
	<div class="grid items-start gap-3 sm:grid-cols-[1fr_8rem]">
		<Field label="Name" for="project-name"
			><Input id="project-name" bind:value={name} required maxlength={120} /></Field
		>
		<Field label="Key" for="project-key" hint="Keys cannot change."
			><Input id="project-key" value={project.key} disabled class="font-mono" /></Field
		>
	</div>
	<Field label="Description" for="project-description">
		<FormatToolbar view={descriptionEl} />
		<MarkdownEditor
			id="project-description"
			bind:view={descriptionEl}
			bind:value={description}
			extensions={[imageUploadExtension(() => imageTarget)]}
			commands={[imageCommand(() => imageTarget)]}
		/>
		<div class="flex justify-end">
			<AddImageButton view={descriptionEl} target={imageTarget} />
		</div>
	</Field>
	<div><Button type="submit" disabled={busy || !name}>Save</Button></div>
</form>
