<script lang="ts">
	import CableIcon from '@lucide/svelte/icons/cable';
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Switch } from '#lib/shared/ui/primitives/switch/index.js';
	import { Label } from '#lib/shared/ui/primitives/label/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { MAPPING_KEYS, type MappingKey } from '#lib/shared/domain/constants.ts';
	import { suggestMapping } from '#lib/shared/domain/status-mapping.ts';
	import type {
		Project,
		StatusMapping,
		TicketingConnection,
		TicketingProject,
		TicketingState,
		TicketProviderInfo
	} from '#lib/shared/domain/types.ts';
	import StatusMappingEditor from './StatusMappingEditor.svelte';

	interface Props {
		project: Project;
		providers: TicketProviderInfo[];
		connections: TicketingConnection[];
	}

	let { project, providers, connections }: Props = $props();

	const NONE = 'none';
	const PULL_OPTIONS = [
		{ value: '5', label: '5 minutes' },
		{ value: '10', label: '10 minutes' }
	];
	let connectionId = $state(NONE);
	let target = $state<Record<string, string>>({});
	let selection = $state<Partial<Record<MappingKey, string>>>({});
	let autoSync = $state(true);
	let postComments = $state(true);
	let autoPull = $state(false);
	let pullMinutes = $state('10');
	let busy = $state(false);
	let states = $state<TicketingState[]>([]);
	let loadingStates = $state(false);
	let statesError = $state<string | null>(null);
	let loadToken = 0;
	let projects = $state<TicketingProject[]>([]);
	let projectsError = $state<string | null>(null);
	let projectsToken = 0;

	$effect.pre(() => {
		const ticketing = project.ticketing;
		connectionId = ticketing.connectionId ?? NONE;
		target = { ...ticketing.target };
		selection = Object.fromEntries(
			Object.entries(ticketing.statusMapping).map(([key, state]) => [key, state.id])
		);
		autoSync = ticketing.autoSync;
		postComments = ticketing.postComments;
		autoPull = ticketing.autoPull;
		pullMinutes = String(ticketing.pullMinutes);
	});

	const connection = $derived(connections.find((c) => c.id === connectionId));
	const provider = $derived(providers.find((p) => p.id === connection?.provider));
	const fields = $derived(provider?.settings.filter((s) => s.scope === 'project') ?? []);
	const options = $derived([
		{ value: NONE, label: 'None' },
		...connections.map((c) => ({
			value: c.id,
			label: `${c.name} · ${providers.find((p) => p.id === c.provider)?.label ?? c.provider}`
		}))
	]);

	async function loadStates() {
		if (!connection || !provider?.supportsStates) {
			states = [];
			statesError = null;
			return;
		}
		const missing = fields.find((f) => f.required && !target[f.name]?.trim());
		if (missing) {
			states = [];
			statesError = `Fill in ${missing.label} to load the states.`;
			return;
		}
		const token = ++loadToken;
		loadingStates = true;
		statesError = null;
		const outcome = await runOperation<TicketingState[]>(
			'list_ticketing_states',
			{ project: project.id, connectionId: connection.id, target: cleanTarget() },
			{ refresh: false, silent: true }
		);
		if (token !== loadToken) return;
		loadingStates = false;
		if (outcome.ok) states = outcome.result;
		else {
			states = [];
			statesError = outcome.message;
		}
	}

	async function loadProjects() {
		projects = [];
		projectsError = null;
		if (!connection || !provider?.supportsProjects) return;
		const token = ++projectsToken;
		const outcome = await runOperation<TicketingProject[]>(
			'list_ticketing_projects',
			{ connection: connection.id },
			{ refresh: false, silent: true }
		);
		if (token !== projectsToken) return;
		if (outcome.ok) projects = outcome.result;
		else projectsError = outcome.message;
	}

	function projectOptions(current: string | undefined) {
		const options = projects.map((p) => ({ value: p.id, label: `${p.name} · ${p.identifier}` }));
		return current && !projects.some((p) => p.id === current)
			? [{ value: current, label: current }, ...options]
			: options;
	}

	$effect(() => {
		void connectionId;
		untrack(() => {
			void loadProjects();
			void loadStates();
		});
	});

	function cleanTarget() {
		const known = new Set(fields.map((f) => f.name));
		return Object.fromEntries(Object.entries(target).filter(([k, v]) => known.has(k) && v?.trim()));
	}

	function suggest() {
		selection = Object.fromEntries(
			Object.entries(suggestMapping(states)).map(([key, state]) => [key, state.id])
		);
	}

	function buildMapping(): StatusMapping {
		const mapping: StatusMapping = {};
		for (const key of MAPPING_KEYS) {
			const id = selection[key];
			if (!id) continue;
			const name =
				states.find((s) => s.id === id)?.name ?? project.ticketing.statusMapping[key]?.name ?? id;
			mapping[key] = { id, name };
		}
		return mapping;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		await runOperation(
			'set_project_ticketing',
			connection
				? {
						project: project.id,
						connectionId: connection.id,
						target: cleanTarget(),
						statusMapping: provider?.supportsStates ? buildMapping() : {},
						autoSync,
						postComments,
						autoPull: provider?.supportsPull ? autoPull : false,
						pullMinutes: Number(pullMinutes)
					}
				: { project: project.id, connectionId: null },
			{ success: 'Ticketing saved' }
		);
		busy = false;
	}
</script>

{#if connections.length === 0}
	<EmptyState
		title="No ticketing connection yet"
		description="Connections hold the account and API key of an external system. Create one, then select it here."
	>
		{#snippet icon()}<CableIcon />{/snippet}
		{#snippet action()}
			<Button href={resolve('/settings/ticketing')} variant="outline">Open Ticketing</Button>
		{/snippet}
	</EmptyState>
{:else}
	<form class="grid gap-5" onsubmit={submit}>
		<Field
			label="Ticketing connection"
			for="ticketing-connection"
			hint="Connections are managed in the Ticketing menu."
		>
			<ChoiceSelect
				id="ticketing-connection"
				bind:value={connectionId}
				{options}
				class="sm:w-96"
				onchange={() => {
					target = {};
					selection = {};
				}}
			/>
		</Field>

		{#if provider}
			<p class="text-sm text-muted-foreground">{provider.description}</p>
			{#each fields as field (field.name)}
				<Field
					label={field.label + (field.required ? '' : ' (optional)')}
					for="target-{field.name}"
					hint={field.help}
				>
					{#if field.picker === 'projects' && projects.length}
						<ChoiceSelect
							id="target-{field.name}"
							bind:value={target[field.name]}
							options={projectOptions(target[field.name])}
							placeholder="Select a project"
							class="sm:w-96"
							onchange={() => void loadStates()}
						/>
					{:else}
						<Input
							id="target-{field.name}"
							bind:value={target[field.name]}
							required={field.required}
							placeholder={field.placeholder}
						/>
						{#if field.picker === 'projects' && projectsError}
							<p class="mt-1 text-sm text-destructive">
								Could not load the project list ({projectsError}). Enter the ID by hand.
							</p>
						{/if}
					{/if}
				</Field>
			{/each}

			{#if provider.supportsStates}
				<StatusMappingEditor
					bind:selection
					saved={project.ticketing.statusMapping}
					{states}
					loading={loadingStates}
					error={statesError}
					onreload={loadStates}
					onsuggest={suggest}
				/>
			{/if}

			<div class="grid gap-3">
				<div class="flex items-center gap-3">
					<Switch id="ticketing-auto" bind:checked={autoSync} />
					<Label for="ticketing-auto" class="font-normal"
						>Sync task progress, descriptions and comments automatically</Label
					>
				</div>
				<div class="flex items-center gap-3">
					<Switch id="ticketing-comments" bind:checked={postComments} />
					<Label for="ticketing-comments" class="font-normal"
						>Post task descriptions, comments and status updates as comments</Label
					>
				</div>
				{#if provider.supportsPull}
					<div class="flex items-center gap-3">
						<Switch id="ticketing-pull" bind:checked={autoPull} />
						<Label for="ticketing-pull" class="font-normal">Pull ticket changes automatically</Label
						>
					</div>
					{#if autoPull}
						<Field label="Pull every" for="ticketing-pull-minutes">
							<ChoiceSelect
								id="ticketing-pull-minutes"
								bind:value={pullMinutes}
								options={PULL_OPTIONS}
								class="sm:w-40"
							/>
						</Field>
					{/if}
				{/if}
			</div>
		{/if}

		<div><Button type="submit" disabled={busy}>Save ticketing</Button></div>
	</form>
{/if}
