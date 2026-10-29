<script lang="ts">
	import CodeIcon from '@lucide/svelte/icons/code-xml';
	import FlaskIcon from '@lucide/svelte/icons/flask-conical';
	import RocketIcon from '@lucide/svelte/icons/rocket';
	import type { Stage } from '#lib/shared/domain/constants.ts';
	import { stageTone, toneClasses } from '#lib/shared/config/tokens/index.ts';
	import { cn } from '#lib/shared/lib/utils.ts';

	let { stage, class: className }: { stage: Stage; class?: string } = $props();
	const Icon = $derived({ dev: CodeIcon, test: FlaskIcon, deploy: RocketIcon }[stage]);
</script>

<Icon class={cn('size-4', toneClasses[stageTone[stage]].text, className)} aria-hidden="true" />
