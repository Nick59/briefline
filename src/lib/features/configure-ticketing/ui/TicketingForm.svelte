<script lang="ts">
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Switch } from '#lib/shared/ui/primitives/switch/index.js';
	import { Label } from '#lib/shared/ui/primitives/label/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import type { Project, TicketProviderInfo } from '#lib/shared/domain/types.ts';

	let { project, providers }: { project: Project; providers: TicketProviderInfo[] } = $props();

	const NONE = 'none';
	let providerId = $state(NONE);
	let settings = $state<Record<string, string>>({});
	let autoSync = $state(true);
	let postComments = $state(true);
	let busy = $state(false);

	$effect.pre(() => {
		providerId = project.ticketing?.provider ?? NONE;
		settings = { ...project.ticketing?.settings };
		autoSync = project.ticketing?.autoSync ?? true;
		postComments = project.ticketing?.postComments ?? true;
	});

	const provider = $derived(providers.find((p) => p.id === providerId));
	const options = $derived([
		{ value: NONE, label: 'Not connected' },
		...providers.map((p) => ({ value: p.id, label: p.label }))
	]);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const known = new Set(provider?.settings.map((s) => s.name));
		const ticketing = provider
			? {
					provider: provider.id,
					settings: Object.fromEntries(
						Object.entries(settings).filter(([k, v]) => known.has(k) && v)
					),
					autoSync,
					postComments
				}
			: null;
		await runOperation(
			'update_project',
			{ project: project.id, ticketing },
			{ success: 'Ticketing saved' }
		);
		busy = false;
	}
</script>

<form class="grid gap-5" onsubmit={submit}>
	<Field label="Ticketing system" for="ticketing-provider">
		<ChoiceSelect id="ticketing-provider" bind:value={providerId} {options} class="sm:w-72" />
	</Field>

	{#if provider}
		<p class="text-sm text-muted-foreground">{provider.description}</p>
		{#each provider.settings as setting (setting.name)}
			<Field
				label={setting.label + (setting.required ? '' : ' (optional)')}
				for="setting-{setting.name}"
				hint={setting.help}
			>
				<Input
					id="setting-{setting.name}"
					bind:value={settings[setting.name]}
					required={setting.required}
					placeholder={setting.placeholder}
				/>
			</Field>
		{/each}
		{#if provider.envVars.length}
			<div class="rounded-lg border bg-sunken p-3 text-sm">
				<p class="font-medium">Credentials</p>
				<p class="text-muted-foreground">
					Set these environment variables on the server; secrets are never stored in the database:
					{#each provider.envVars as name, i (name)}
						<code class="font-mono text-xs text-foreground">{name}</code>{i <
						provider.envVars.length - 1
							? ', '
							: '.'}
					{/each}
				</p>
			</div>
		{/if}
		<div class="grid gap-3">
			<div class="flex items-center gap-3">
				<Switch id="ticketing-auto" bind:checked={autoSync} />
				<Label for="ticketing-auto" class="font-normal"
					>Update tickets automatically when tasks move</Label
				>
			</div>
			<div class="flex items-center gap-3">
				<Switch id="ticketing-comments" bind:checked={postComments} />
				<Label for="ticketing-comments" class="font-normal"
					>Post a comment for each status change</Label
				>
			</div>
		</div>
	{/if}

	<div><Button type="submit" disabled={busy}>Save ticketing</Button></div>
</form>
