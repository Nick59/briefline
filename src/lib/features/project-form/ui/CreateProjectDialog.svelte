<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Textarea } from '#lib/shared/ui/primitives/textarea/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import type { Project } from '#lib/shared/domain/types.ts';
	import type { Snippet } from 'svelte';

	let { trigger }: { trigger?: Snippet<[{ props: Record<string, unknown> }]> } = $props();

	let open = $state(false);
	let name = $state('');
	let key = $state('');
	let keyTouched = $state(false);
	let description = $state('');
	let busy = $state(false);

	const suggestedKey = $derived(
		name
			.split(/\s+/)
			.filter(Boolean)
			.map((w) => w[0])
			.join('')
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, '')
			.slice(0, 4)
			.padEnd(2, 'X')
	);
	const effectiveKey = $derived(keyTouched ? key : name ? suggestedKey : '');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const outcome = await runOperation<Project>(
			'create_project',
			{ name, key: effectiveKey, description },
			{ success: 'Project created', refresh: false }
		);
		busy = false;
		if (outcome.ok) {
			open = false;
			await goto(resolve('/projects/[project]', { project: outcome.result.key }));
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			{#if trigger}{@render trigger({ props })}{:else}<Button {...props}
					><PlusIcon />New project</Button
				>{/if}
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-lg">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>New project</Dialog.Title>
				<Dialog.Description
					>A project groups epics. Its key prefixes every epic and task, like SHOP-E1 and SHOP-12.</Dialog.Description
				>
			</Dialog.Header>
			<div class="grid grid-cols-[1fr_7rem] gap-3">
				<Field label="Name" for="project-name">
					<Input
						id="project-name"
						bind:value={name}
						required
						maxlength={120}
						placeholder="Storefront"
					/>
				</Field>
				<Field label="Key" for="project-key">
					<Input
						id="project-key"
						class="font-mono uppercase"
						value={effectiveKey}
						oninput={(e) => {
							keyTouched = true;
							key = e.currentTarget.value.toUpperCase();
						}}
						required
						pattern="[A-Za-z][A-Za-z0-9]{'{1,9}'}"
						maxlength={10}
					/>
				</Field>
			</div>
			<Field label="Description" for="project-description">
				<Textarea
					id="project-description"
					bind:value={description}
					rows={3}
					placeholder="What is this project about?"
				/>
			</Field>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !name}>Create project</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
