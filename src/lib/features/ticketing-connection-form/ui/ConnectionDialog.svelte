<script lang="ts">
	import type { Snippet } from 'svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import type { TicketingConnection, TicketProviderInfo } from '#lib/shared/domain/types.ts';

	interface Props {
		providers: TicketProviderInfo[];
		/** Edits this connection; creates a new one when omitted. */
		connection?: TicketingConnection;
		secretsAvailable: boolean;
		trigger?: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { providers, connection, secretsAvailable, trigger }: Props = $props();

	let open = $state(false);
	let providerId = $state('');
	let name = $state('');
	let settings = $state<Record<string, string>>({});
	let secret = $state('');
	let busy = $state(false);

	const provider = $derived(providers.find((p) => p.id === providerId));
	const fields = $derived(provider?.settings.filter((s) => s.scope === 'connection') ?? []);
	const providerOptions = $derived(providers.map((p) => ({ value: p.id, label: p.label })));

	function reset() {
		providerId = connection?.provider ?? providers[0]?.id ?? '';
		name = connection?.name ?? '';
		settings = { ...connection?.settings };
		secret = '';
	}

	function clean() {
		const known = new Set(fields.map((f) => f.name));
		return Object.fromEntries(Object.entries(settings).filter(([k, v]) => known.has(k) && v));
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const outcome = connection
			? await runOperation(
					'update_ticketing_connection',
					{
						connection: connection.id,
						name,
						settings: clean(),
						...(secret ? { secret } : {})
					},
					{ success: 'Connection saved' }
				)
			: await runOperation(
					'create_ticketing_connection',
					{ name, provider: providerId, settings: clean(), ...(secret ? { secret } : {}) },
					{ success: 'Connection created' }
				);
		busy = false;
		if (outcome.ok) open = false;
	}

	async function clearSecret() {
		if (!connection) return;
		busy = true;
		await runOperation(
			'update_ticketing_connection',
			{ connection: connection.id, clearSecret: true },
			{ success: 'API key removed' }
		);
		busy = false;
	}
</script>

<Dialog.Root bind:open onOpenChange={(value) => value && reset()}>
	<Dialog.Trigger>
		{#snippet child({ props })}
			{#if trigger}{@render trigger({ props })}{:else if connection}<Button
					{...props}
					variant="outline"
					size="sm"
					aria-label="Edit {connection.name}"><PencilIcon />Edit</Button
				>{:else}<Button {...props}><PlusIcon />New connection</Button>{/if}
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>{connection ? 'Edit connection' : 'New ticketing connection'}</Dialog.Title>
				<Dialog.Description>
					An account in an external system. Projects pick a connection and add their own project,
					team or repository.
				</Dialog.Description>
			</Dialog.Header>

			<Field label="Ticketing system" for="connection-provider">
				{#if connection}
					<Input id="connection-provider" value={provider?.label ?? connection.provider} disabled />
				{:else}
					<ChoiceSelect
						id="connection-provider"
						bind:value={providerId}
						options={providerOptions}
					/>
				{/if}
			</Field>
			{#if provider}<p class="-mt-2 text-sm text-muted-foreground">{provider.description}</p>{/if}

			<Field label="Name" for="connection-name" hint="Shown when a project picks a connection.">
				<Input
					id="connection-name"
					bind:value={name}
					required
					maxlength={120}
					placeholder="Acme Plane"
				/>
			</Field>

			{#each fields as field (field.name)}
				<Field
					label={field.label + (field.required ? '' : ' (optional)')}
					for="connection-{field.name}"
					hint={field.help}
				>
					<Input
						id="connection-{field.name}"
						bind:value={settings[field.name]}
						required={field.required}
						placeholder={field.placeholder}
					/>
				</Field>
			{/each}

			{#if provider?.secretLabel}
				<Field
					label={provider.secretLabel}
					for="connection-secret"
					hint={connection?.secretSource === 'env' && !connection.hasSecret
						? `Using environment variable ${provider.secretEnvVar}. Enter a key to store one instead.`
						: !connection?.hasSecret && provider.secretEnvVar
							? `Optional when ${provider.secretEnvVar} is set on the server.`
							: 'Stored encrypted and never shown again.'}
				>
					<div class="flex gap-2">
						<Input
							id="connection-secret"
							type="password"
							autocomplete="new-password"
							bind:value={secret}
							disabled={!secretsAvailable}
							placeholder={connection?.hasSecret ? 'Saved — leave empty to keep' : ''}
						/>
						{#if connection?.hasSecret}
							<Button type="button" variant="outline" disabled={busy} onclick={clearSecret}
								>Clear</Button
							>
						{/if}
					</div>
				</Field>
				{#if !secretsAvailable}
					<p class="-mt-2 text-xs text-warning" role="status">
						Saving API keys needs BRIEFLINE_SECRET_KEY on the server (<code class="font-mono"
							>openssl rand -base64 32</code
						>).
					</p>
				{/if}
			{/if}

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !name || !provider}>
					{connection ? 'Save connection' : 'Create connection'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
