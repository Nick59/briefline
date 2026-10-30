<script lang="ts">
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import XIcon from '@lucide/svelte/icons/x';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { MarkdownViewer, type MarkdownExtension } from '#lib/shared/ui/markdown/index.ts';
	import type { Spec } from '#lib/shared/domain/types.ts';
	import { SpecKindBadge } from '#lib/entities/spec/index.ts';

	interface Props {
		spec: Spec;
		extensions?: MarkdownExtension[];
	}

	let { spec, extensions = [] }: Props = $props();
	let open = $state(false);
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="sm" aria-label="Read mode">
				<BookOpenIcon /><span class="hidden sm:inline">Read mode</span>
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content
		showCloseButton={false}
		class="inset-0 top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_1fr] gap-0 rounded-none bg-background p-0 sm:max-w-none"
	>
		<header class="flex items-center justify-between gap-3 border-b px-4 py-2">
			<div class="flex min-w-0 items-center gap-2">
				<SpecKindBadge kind={spec.kind} />
				<Dialog.Title class="truncate text-base font-semibold">{spec.title}</Dialog.Title>
			</div>
			<Dialog.Description class="sr-only">Full screen reading view of this spec.</Dialog.Description
			>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon-sm" aria-label="Close read mode"
						><XIcon /></Button
					>
				{/snippet}
			</Dialog.Close>
		</header>
		<div class="min-h-0 overflow-y-auto overscroll-contain">
			<div class="mx-auto max-w-3xl px-5 py-8 sm:py-12">
				<MarkdownViewer source={spec.content} {extensions} class="prose-lg leading-8" />
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
