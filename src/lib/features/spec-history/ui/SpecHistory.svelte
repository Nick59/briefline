<script lang="ts">
	import GitCompareIcon from '@lucide/svelte/icons/git-compare';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { ChoiceSelect } from '#lib/shared/ui/choice-select/index.ts';
	import { MarkdownViewer, type MarkdownExtension } from '#lib/shared/ui/markdown/index.ts';
	import type { Spec, SpecVersion } from '#lib/shared/domain/types.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { formatDate } from '#lib/shared/lib/format.ts';
	import { lineDiff } from '#lib/shared/lib/line-diff.ts';

	interface Props {
		spec: Spec;
		extensions?: MarkdownExtension[];
	}

	let { spec, extensions = [] }: Props = $props();

	let versions = $state<SpecVersion[]>([]);
	let picked = $state<number | null>(null);
	let diff = $state(false);

	$effect(() => {
		// Reload when the spec is edited, not only when another spec is shown.
		void spec.updatedAt;
		const specId = spec.id;
		picked = null;
		void runOperation<SpecVersion[]>(
			'list_spec_versions',
			{ spec: specId },
			{ refresh: false, silent: true }
		).then((outcome) => {
			if (specId === spec.id && outcome.ok) versions = outcome.result;
		});
	});

	const latest = $derived(versions[0]);
	const selected = $derived(versions.find((v) => v.version === picked) ?? latest);
	const previous = $derived(selected && versions.find((v) => v.version === selected.version - 1));
	const rows = $derived(previous && selected ? lineDiff(previous.content, selected.content) : []);
	const added = $derived(rows.filter((r) => r.type === 'add').length);
	const removed = $derived(rows.filter((r) => r.type === 'del').length);
	const options = $derived(
		versions.map((v) => ({
			value: String(v.version),
			label: `v${v.version} · ${v.current ? 'current' : formatDate(v.createdAt)}`
		}))
	);
	const rowClass = {
		same: '',
		add: 'bg-emerald-500/15',
		del: 'bg-red-500/15'
	};
	const marker = { same: ' ', add: '+', del: '-' };
</script>

{#if versions.length > 1 && selected}
	<div class="mb-3 flex flex-wrap items-center gap-2">
		<ChoiceSelect
			class="w-44"
			{options}
			value={String(selected.version)}
			onchange={(value) => (picked = Number(value))}
		/>
		<Button
			variant={diff ? 'outline' : 'ghost'}
			size="sm"
			aria-pressed={diff}
			disabled={!previous}
			onclick={() => (diff = !diff)}
		>
			<GitCompareIcon />Diff with previous
		</Button>
		{#if !selected.current}
			<span class="text-xs text-muted-foreground"
				>Viewing v{selected.version} of v{latest.version}</span
			>
		{/if}
	</div>
{/if}

{#if diff && previous && selected}
	<div class="space-y-2">
		<p class="text-xs text-muted-foreground">
			<span class="text-emerald-600 dark:text-emerald-400">+{added}</span>
			<span class="text-red-600 dark:text-red-400">−{removed}</span>
		</p>
		{#if previous.title !== selected.title}
			<p class="font-mono text-xs">
				<span class="bg-red-500/15 px-1">- {previous.title}</span>
				<span class="bg-emerald-500/15 px-1">+ {selected.title}</span>
			</p>
		{/if}
		<div class="overflow-x-auto rounded-md border font-mono text-xs">
			<div class="w-max min-w-full">
				{#each rows as row, i (i)}
					<div class="flex {rowClass[row.type]}">
						<span class="w-10 shrink-0 px-1 text-right text-muted-foreground select-none"
							>{row.oldNo ?? ''}</span
						>
						<span class="w-10 shrink-0 px-1 text-right text-muted-foreground select-none"
							>{row.newNo ?? ''}</span
						>
						<span class="w-4 shrink-0 text-center select-none">{marker[row.type]}</span>
						<span class="pr-3 whitespace-pre">{row.text}</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
{:else}
	<MarkdownViewer source={selected?.content ?? spec.content} {extensions} />
{/if}
