<script lang="ts">
	import CableIcon from '@lucide/svelte/icons/cable';
	import type {
		SecretSource,
		TicketingConnection,
		TicketProviderInfo
	} from '#lib/shared/domain/types.ts';
	import type { Tone } from '#lib/shared/config/tokens/index.ts';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';
	import {
		ConnectionDialog,
		TestConnectionButton
	} from '#lib/features/ticketing-connection-form/index.ts';
	import { DeleteButton } from '#lib/features/delete-entity/index.ts';

	interface Props {
		connections: TicketingConnection[];
		providers: TicketProviderInfo[];
		secretsAvailable: boolean;
	}

	let { connections, providers, secretsAvailable }: Props = $props();

	const providerOf = (id: string) => providers.find((p) => p.id === id);
	const secretBadge: Record<
		SecretSource,
		{ tone: Tone; label: (p?: TicketProviderInfo) => string }
	> = {
		stored: { tone: 'success', label: () => 'API key stored (encrypted)' },
		env: { tone: 'neutral', label: (p) => `Using environment variable ${p?.secretEnvVar ?? ''}` },
		none: { tone: 'warning', label: () => 'No API key' }
	};
</script>

<div class="max-w-3xl space-y-8">
	<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
		<p class="text-sm text-muted-foreground">
			Connections to GitHub, Jira, Linear, Plane and other systems. Each project selects one in its
			settings and maps its statuses to the states of the external project.
		</p>
		<ConnectionDialog {providers} {secretsAvailable} />
	</div>

	{#if !secretsAvailable}
		<p class="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="status">
			<code class="font-mono text-xs">BRIEFLINE_SECRET_KEY</code> is not set, so API keys cannot be
			saved. Generate one with <code class="font-mono text-xs">openssl rand -base64 32</code>, put
			it in <code class="font-mono text-xs">.env</code> at the project root (or in the environment), and
			restart the server. Or keep using the provider environment variables.
		</p>
	{/if}

	{#if connections.length === 0}
		<EmptyState
			title="No connections yet"
			description="Create a connection, then select it in a project's settings to keep external tickets in step."
		>
			{#snippet icon()}<CableIcon />{/snippet}
			{#snippet action()}<ConnectionDialog {providers} {secretsAvailable} />{/snippet}
		</EmptyState>
	{:else}
		<ul class="space-y-3">
			{#each connections as connection (connection.id)}
				{@const provider = providerOf(connection.provider)}
				{@const badge = secretBadge[connection.secretSource]}
				<li class="space-y-3 rounded-xl border bg-card p-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0 space-y-1.5">
							<h2 class="truncate text-sm font-semibold">{connection.name}</h2>
							<div class="flex flex-wrap items-center gap-2">
								<ToneBadge tone="brand">{provider?.label ?? connection.provider}</ToneBadge>
								{#if provider?.secretLabel}
									<ToneBadge tone={badge.tone}>{badge.label(provider)}</ToneBadge>
								{/if}
								{#if connection.secretUnreadable || connection.headersUnreadable}
									<ToneBadge tone="warning">
										{connection.secretUnreadable && connection.headersUnreadable
											? "API key and headers can't be read"
											: connection.secretUnreadable
												? "API key can't be read"
												: "Headers can't be read"}
									</ToneBadge>
								{/if}
							</div>
						</div>
						<div class="flex items-center gap-1.5">
							<TestConnectionButton connectionId={connection.id} name={connection.name} />
							<ConnectionDialog {providers} {connection} {secretsAvailable} />
							<DeleteButton
								operation="delete_ticketing_connection"
								input={{ connection: connection.id }}
								what="connection {connection.name}"
								consequence="Projects can no longer use it. A connection that projects still use cannot be deleted."
							/>
						</div>
					</div>
					<p class="text-xs text-muted-foreground">
						{#if connection.usedBy.length === 0}
							Not used by any project.
						{:else}
							Used by {connection.usedBy.length}
							{connection.usedBy.length === 1 ? 'project' : 'projects'}: {connection.usedBy
								.map((p) => p.name)
								.join(', ')}
						{/if}
					</p>
				</li>
			{/each}
		</ul>
	{/if}
</div>
