<script lang="ts">
	import type { StateCommand } from '@codemirror/state';
	import type { EditorView } from '@codemirror/view';
	import BoldIcon from '@lucide/svelte/icons/bold';
	import CodeIcon from '@lucide/svelte/icons/code';
	import HeadingIcon from '@lucide/svelte/icons/heading';
	import ItalicIcon from '@lucide/svelte/icons/italic';
	import LinkIcon from '@lucide/svelte/icons/link';
	import ListIcon from '@lucide/svelte/icons/list';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
	import QuoteIcon from '@lucide/svelte/icons/quote';
	import StrikethroughIcon from '@lucide/svelte/icons/strikethrough';
	import { buttonVariants } from '#lib/shared/ui/primitives/button/button.variants.ts';
	import {
		insertLink,
		toggleLinePrefix,
		toggleTask,
		toggleWrap
	} from '#lib/shared/ui/markdown-editor/index.ts';
	import { cn } from '#lib/shared/lib/utils.js';

	interface Props {
		view: EditorView | null;
		class?: string;
	}

	let { view, class: className }: Props = $props();

	const button = buttonVariants({ variant: 'ghost', size: 'icon-sm' });
	const buttons: { label: string; title: string; icon: typeof BoldIcon; run: StateCommand }[] = [
		{ label: 'Heading', title: 'Heading', icon: HeadingIcon, run: toggleLinePrefix('heading') },
		{ label: 'Bold', title: 'Bold (Ctrl or ⌘ + B)', icon: BoldIcon, run: toggleWrap('**') },
		{ label: 'Italic', title: 'Italic (Ctrl or ⌘ + I)', icon: ItalicIcon, run: toggleWrap('*') },
		{
			label: 'Strikethrough',
			title: 'Strikethrough',
			icon: StrikethroughIcon,
			run: toggleWrap('~~')
		},
		{ label: 'Code', title: 'Code', icon: CodeIcon, run: toggleWrap('`') },
		{ label: 'Link', title: 'Link (Ctrl or ⌘ + K)', icon: LinkIcon, run: insertLink },
		{ label: 'Quote', title: 'Quote', icon: QuoteIcon, run: toggleLinePrefix('quote') },
		{ label: 'Bullet list', title: 'Bullet list', icon: ListIcon, run: toggleLinePrefix('bullet') },
		{
			label: 'Numbered list',
			title: 'Numbered list',
			icon: ListOrderedIcon,
			run: toggleLinePrefix('ordered')
		},
		{
			label: 'Task list',
			title: 'Task list (Ctrl or ⌘ + L toggles a checkbox)',
			icon: ListChecksIcon,
			run: toggleTask
		}
	];

	function apply(run: StateCommand) {
		if (!view) return;
		run(view);
		view.focus();
	}
</script>

<div role="toolbar" aria-label="Formatting" class={cn('flex flex-wrap items-center', className)}>
	{#each buttons as { label, title, icon: Icon, run } (label)}
		<button
			type="button"
			class={button}
			aria-label={label}
			{title}
			disabled={!view}
			onmousedown={(event) => event.preventDefault()}
			onclick={() => apply(run)}
		>
			<Icon />
		</button>
	{/each}
</div>
