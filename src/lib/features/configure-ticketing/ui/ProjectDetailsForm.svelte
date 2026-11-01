<script lang="ts">
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Textarea } from '#lib/shared/ui/primitives/textarea/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import type { Project } from '#lib/shared/domain/types.ts';

	let { project }: { project: Project } = $props();
	let name = $state('');
	let description = $state('');
	let busy = $state(false);

	$effect.pre(() => {
		name = project.name;
		description = project.description;
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
	<Field label="Description" for="project-description"
		><Textarea id="project-description" bind:value={description} rows={3} /></Field
	>
	<div><Button type="submit" disabled={busy || !name}>Save</Button></div>
</form>
