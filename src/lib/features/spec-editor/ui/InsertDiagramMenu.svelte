<script lang="ts">
	import WorkflowIcon from '@lucide/svelte/icons/workflow';
	import * as DropdownMenu from '#lib/shared/ui/primitives/dropdown-menu/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { DIAGRAM_TEMPLATES, type DiagramTemplate } from '../model/diagram-templates.ts';

	let { oninsert }: { oninsert: (template: DiagramTemplate) => void } = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} type="button" variant="ghost" size="sm"
				><WorkflowIcon />Insert diagram</Button
			>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-52">
		<DropdownMenu.Label class="text-xs text-muted-foreground">Mermaid templates</DropdownMenu.Label>
		{#each DIAGRAM_TEMPLATES as template (template.id)}
			<DropdownMenu.Item onSelect={() => oninsert(template)}>{template.label}</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
