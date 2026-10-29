<script lang="ts" generics="T extends string">
	import * as Select from '#lib/shared/ui/primitives/select/index.js';
	import { cn } from '#lib/shared/lib/utils.ts';

	interface Props {
		value: T;
		options: readonly { value: T; label: string }[];
		id?: string;
		placeholder?: string;
		class?: string;
		onchange?: (value: T) => void;
	}

	let {
		value = $bindable(),
		options,
		id,
		placeholder = 'Select…',
		class: className,
		onchange
	}: Props = $props();
	const selected = $derived(options.find((o) => o.value === value));
</script>

<Select.Root
	type="single"
	bind:value={
		() => value,
		(v) => {
			value = v as T;
			onchange?.(v as T);
		}
	}
>
	<Select.Trigger {id} class={cn('w-full', className)}>
		<span class={cn(!selected && 'text-muted-foreground')}>{selected?.label ?? placeholder}</span>
	</Select.Trigger>
	<Select.Content>
		{#each options as option (option.value)}
			<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
