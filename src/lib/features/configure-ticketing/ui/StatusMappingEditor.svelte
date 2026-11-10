<script lang="ts">
	import RefreshIcon from '@lucide/svelte/icons/refresh-cw';
	import WandIcon from '@lucide/svelte/icons/wand-sparkles';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Label } from '#lib/shared/ui/primitives/label/index.js';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { MAPPING_KEYS, MAPPING_LABELS, type MappingKey } from '#lib/shared/domain/constants.ts';
	import { defaultState } from '#lib/shared/domain/status-mapping.ts';
	import type { MappedState, StatusMapping, TicketingState } from '#lib/shared/domain/types.ts';
	import { cn } from '#lib/shared/lib/utils.ts';

	interface Props {
		/** Selected state id per row; a missing key means the provider default. */
		selection: Partial<Record<MappingKey, string>>;
		saved: StatusMapping;
		states: TicketingState[];
		loading: boolean;
		error: string | null;
		onreload: () => void;
		onsuggest: () => void;
	}

	let {
		selection = $bindable(),
		saved,
		states,
		loading,
		error,
		onreload,
		onsuggest
	}: Props = $props();

	const DEFAULT = '__default';
	const loaded = $derived(states.length > 0);

	function options(key: MappingKey) {
		const fallback = defaultState(key, states);
		const list = [
			{
				value: DEFAULT,
				label: `Default (${fallback ? fallback.name : 'provider rule'})`
			},
			...states.map((s) => ({ value: s.id, label: s.name }))
		];
		const chosen: MappedState | undefined = saved[key];
		if (selection[key] && !states.some((s) => s.id === selection[key]))
			list.push({
				value: selection[key],
				label:
					chosen && chosen.id === selection[key]
						? `${chosen.name}${loaded ? ' (not found)' : ''}`
						: selection[key]
			});
		return list;
	}
</script>

<div class="grid gap-3">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<p class="text-sm font-medium">Status mapping</p>
			<p class="text-xs text-muted-foreground">
				The state each linked ticket moves to. Rows left on Default use the provider's own rule.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button type="button" variant="outline" size="sm" disabled={loading} onclick={onreload}>
				<RefreshIcon class={cn(loading && 'animate-spin')} />Reload states
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={loading || !loaded}
				onclick={onsuggest}
			>
				<WandIcon />Suggest mapping
			</Button>
		</div>
	</div>

	{#if error}
		<p class="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm" role="alert">
			{error}
			<a class="font-medium underline underline-offset-2" href={resolve('/settings/ticketing')}
				>Check the connection</a
			>
		</p>
	{:else if loading && !loaded}
		<p class="text-sm text-muted-foreground" role="status">Loading states…</p>
	{/if}

	<div class="grid gap-2">
		{#each MAPPING_KEYS as key (key)}
			<div class="grid items-center gap-1.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
				<Label for="mapping-{key}" class="text-sm font-normal">{MAPPING_LABELS[key]}</Label>
				<ChoiceSelect
					id="mapping-{key}"
					value={selection[key] ?? DEFAULT}
					options={options(key)}
					onchange={(value) => {
						const next = { ...selection };
						if (value === DEFAULT) delete next[key];
						else next[key] = value;
						selection = next;
					}}
				/>
			</div>
		{/each}
	</div>
</div>
