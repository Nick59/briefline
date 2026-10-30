<script lang="ts">
	import { displayKey } from '#lib/shared/domain/display-key.ts';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import * as DropdownMenu from '#lib/shared/ui/primitives/dropdown-menu/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import {
		STAGES,
		STAGE_LABELS,
		STATUS_LABELS,
		WORK_STATUSES,
		type Stage
	} from '#lib/shared/domain/constants.ts';
	import type { Task } from '#lib/shared/domain/types.ts';
	import { stageTone } from '#lib/shared/config/tokens/index.ts';
	import { StatusIcon } from '#lib/entities/work-status/index.ts';
	import { moveTask } from '../model/move-task.ts';

	let { task, stage }: { task: Task; stage?: Stage } = $props();
	const stages = $derived(stage ? [stage] : STAGES);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-xs"
				aria-label="Change status of {displayKey(task)}"
				class="opacity-60 group-hover:opacity-100"
			>
				<EllipsisIcon />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-48">
		{#each stages as s (s)}
			<DropdownMenu.Group>
				<DropdownMenu.Label class="text-xs text-muted-foreground"
					>{STAGE_LABELS[s]}</DropdownMenu.Label
				>
				{#each WORK_STATUSES as status (status)}
					<DropdownMenu.Item
						disabled={task.stages[s] === status}
						onSelect={() => moveTask(task.id, s, status)}
					>
						<StatusIcon {status} tone={status === 'todo' ? undefined : stageTone[s]} />
						{STATUS_LABELS[status]}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Group>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
