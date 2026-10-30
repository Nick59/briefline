<script lang="ts">
	import type { Snippet } from 'svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
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
	let headers = $state<{ name: string; value: string; saved: boolean }[]>([]);
	let busy = $state(false);

	const provider = $derived(providers.find((p) => p.id === providerId));
	const fields = $derived(provider?.settings.filter((s) => s.scope === 'connection') ?? []);
	const providerOptions = $derived(providers.map((p) => ({ value: p.id, label: p.label })));

	function reset() {
		providerId = connection?.provider ?? providers[0]?.id ?? '';
		name = connection?.name ?? '';
		settings = { ...connection?.settings };
		secret = '';
		headers = (connection?.headers ?? []).map((h) => ({ name: h.name, value: '', saved: true }));
	}

	function cleanHeaders() {
		return headers
			.filter((h) => h.name.trim())
			.map((h) => ({ name: h.name.trim(), ...(h.value ? { value: h.value } : {}) }));
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
						headers: cleanHeaders(),
						...(secret ? { secret } : {})
					},
					{ success: 'Connection saved' }
				)
			: await runOperation(
					'create_ticketing_connection',
					{
						name,
						provider: providerId,
						settings: clean(),
						headers: cleanHeaders(),
						...(secret ? { secret } : {})
					},
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

			<details class="rounded-md border px-3 py-2" open={headers.length > 0}>
				<summary class="cursor-pointer text-sm font-medium">Custom headers</summary>
				<div class="mt-3 grid gap-3">
					<p class="text-sm text-muted-foreground">
						Sent with every request to this provider, e.g. Cloudflare Access service token headers.
					</p>
					{#each headers as header, index (index)}
						<div class="flex items-center gap-2">
							<Input
								bind:value={header.name}
								aria-label="Header {index + 1} name"
								placeholder="CF-Access-Client-Id"
								maxlength={200}
								autocomplete="off"
							/>
							<Input
								type="password"
								bind:value={header.value}
								aria-label="Header {index + 1} value"
								autocomplete="new-password"
								disabled={!secretsAvailable}
								placeholder={header.saved ? '•••••• (unchanged)' : 'Value'}
							/>
							<Button
								type="button"
								variant="outline"
								size="icon"
								aria-label="Remove header {header.name || index + 1}"
								onclick={() => (headers = headers.filter((_, i) => i !== index))}
								><TrashIcon /></Button
							>
						</div>
					{/each}
					<div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={!secretsAvailable || headers.length >= 20}
							onclick={() => (headers = [...headers, { name: '', value: '', saved: false }])}
							><PlusIcon />Add header</Button
						>
					</div>
					{#if !secretsAvailable}
						<p class="text-xs text-warning" role="status">
							Saving headers needs BRIEFLINE_SECRET_KEY on the server.
						</p>
					{/if}
				</div>
			</details>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy || !name || !provider}>
					{connection ? 'Save connection' : 'Create connection'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
