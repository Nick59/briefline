<script lang="ts">
	import MoonIcon from '@lucide/svelte/icons/moon';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { cn } from '#lib/shared/lib/utils.ts';

	const options = [
		{ value: 'light', label: 'Light', icon: SunIcon },
		{ value: 'dark', label: 'Dark', icon: MoonIcon },
		{ value: 'system', label: 'System', icon: MonitorIcon }
	] as const;
</script>

<div role="radiogroup" aria-label="Theme" class="inline-flex gap-1 rounded-lg border p-1">
	{#each options as option (option.value)}
		{@const checked = userPrefersMode.current === option.value}
		<button
			type="button"
			role="radio"
			aria-checked={checked}
			onclick={() => setMode(option.value)}
			class={cn(
				'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
				checked && 'bg-muted font-medium text-foreground'
			)}
		>
			<option.icon class="size-4" />{option.label}
		</button>
	{/each}
</div>
