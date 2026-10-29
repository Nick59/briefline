<script lang="ts">
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { toggleMode } from 'mode-watcher';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
</script>

<Button variant="ghost" size="icon-sm" onclick={toggleMode} aria-label="Toggle dark mode">
	<SunIcon class="hidden dark:block" />
	<MoonIcon class="dark:hidden" />
</Button>
