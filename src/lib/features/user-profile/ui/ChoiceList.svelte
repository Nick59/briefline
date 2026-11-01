<script lang="ts" generics="T extends string">
	import { cn } from '#lib/shared/lib/utils.ts';

	interface Props {
		name: string;
		legend: string;
		value: T;
		options: readonly { value: T; label: string; hint?: string }[];
		class?: string;
	}

	let { name, legend, value = $bindable(), options, class: className }: Props = $props();
</script>

<fieldset class={cn('grid gap-1.5', className)}>
	<legend class="mb-1.5 text-xs font-medium">{legend}</legend>
	{#each options as option (option.value)}
		<label
			class={cn(
				'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
				value === option.value && 'border-primary bg-primary/5'
			)}
		>
			<input
				type="radio"
				{name}
				value={option.value}
				bind:group={value}
				class="mt-0.5 size-4 shrink-0 accent-primary"
			/>
			<span class="grid min-w-0">
				<span class="font-medium">{option.label}</span>
				{#if option.hint}<span class="text-xs text-muted-foreground">{option.hint}</span>{/if}
			</span>
		</label>
	{/each}
</fieldset>
