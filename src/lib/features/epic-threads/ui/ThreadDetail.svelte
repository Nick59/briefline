<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import BotIcon from '@lucide/svelte/icons/bot';
	import CheckIcon from '@lucide/svelte/icons/check';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import UserIcon from '@lucide/svelte/icons/user-round';
	import {
		AddImageButton,
		imageUpload,
		type ImageTarget
	} from '#lib/features/attachment-upload/index.ts';
	import { page } from '$app/state';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Textarea } from '#lib/shared/ui/primitives/textarea/index.js';
	import { MarkdownViewer } from '#lib/shared/ui/markdown/index.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';
	import { RelativeTime } from '#lib/shared/ui/relative-time/index.ts';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { isHumanActor } from '#lib/shared/domain/actors.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import type { Tone } from '#lib/shared/config/tokens/index.ts';
	import type { QuestionStatus } from '#lib/shared/domain/constants.ts';
	import type { EpicQuestion } from '#lib/shared/domain/types.ts';

	interface Props {
		thread: EpicQuestion;
		onback: () => void;
		/** Called after a reply, answer or ignore succeeds. */
		ondone?: () => void;
	}

	let { thread, onback, ondone }: Props = $props();

	let draft = $state('');
	let busy = $state(false);
	let replyEl = $state<HTMLTextAreaElement | null>(null);
	const imageTarget = $derived<ImageTarget | null>(
		page.params.project ? { type: 'project', id: page.params.project } : null
	);
	const text = $derived(draft.trim());

	const tones: Record<QuestionStatus, Tone> = {
		open: 'warning',
		answered: 'success',
		ignored: 'neutral'
	};
	const isHuman = (author: string) => isHumanActor(author, page.data.profile?.name);

	async function run(
		op: string,
		input: Record<string, unknown>,
		{ clear = false, done = false } = {}
	) {
		busy = true;
		const outcome = await runOperation(op, { question: thread.id, ...input });
		busy = false;
		if (!outcome.ok) return;
		if (clear) draft = '';
		if (done) ondone?.();
	}

	const reply = () => text && run('reply_to_question', { body: text }, { clear: true, done: true });
	const answer = () =>
		text && run('update_question', { answer: text }, { clear: true, done: true });

	function pick(option: string) {
		draft = draft === option ? '' : option;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			void reply();
		}
	}
</script>

<div class="grid gap-4">
	<div class="flex items-center justify-between gap-2">
		<Button variant="ghost" size="xs" onclick={onback}><ArrowLeftIcon />All threads</Button>
		<div class="flex items-center gap-2">
			<ToneBadge tone={tones[thread.status]}>{thread.status}</ToneBadge>
			{#if thread.status === 'open'}
				<Button
					variant="outline"
					size="xs"
					disabled={busy}
					onclick={() => run('update_question', { status: 'ignored' }, { done: true })}
					>Ignore</Button
				>
			{:else}
				<Button
					variant="outline"
					size="xs"
					disabled={busy}
					onclick={() => run('update_question', { status: 'open' })}><RotateCcwIcon />Reopen</Button
				>
			{/if}
		</div>
	</div>

	<div class="rounded-xl border bg-card p-4">
		<MarkdownViewer
			source={thread.question}
			class="prose-p:text-base prose-p:font-semibold prose-li:text-base prose-li:font-semibold"
		/>
		{#if thread.context}
			<div class="mt-3 border-l-2 border-border pl-3">
				<MarkdownViewer
					source={thread.context}
					class="[--tw-prose-body:var(--color-muted-foreground)] dark:[--tw-prose-invert-body:var(--color-muted-foreground)]"
				/>
			</div>
		{/if}
		<p class="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
			{#if isHuman(thread.askedBy)}<UserIcon class="size-3" />{:else}<BotIcon class="size-3" />{/if}
			{thread.askedBy} · <RelativeTime value={thread.createdAt} />
		</p>
	</div>

	{#if thread.messages.length > 0}
		<ul class="grid gap-3" aria-label="Replies">
			{#each thread.messages as message (message.id)}
				{@const human = isHuman(message.author)}
				<li
					class={cn(
						'grid gap-1.5 rounded-lg border-l-2 px-3 py-2',
						human ? 'border-brand bg-brand/5' : 'border-border bg-muted/40'
					)}
				>
					<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
						{#if human}<UserIcon class="size-3" />{:else}<BotIcon class="size-3" />{/if}
						<span class="font-medium text-foreground">{message.author}</span>
						<RelativeTime value={message.createdAt} />
					</p>
					<MarkdownViewer source={message.body} />
				</li>
			{/each}
		</ul>
	{/if}

	{#if thread.status === 'answered' && thread.answer}
		<div class="rounded-md bg-muted px-3 py-2 text-sm">
			<div class="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
				<CheckIcon class="size-3 text-success" />Answer by {thread.answeredBy}
				{#if thread.answeredAt}<RelativeTime value={thread.answeredAt} />{/if}
			</div>
			<p class="whitespace-pre-wrap">{thread.answer}</p>
		</div>
	{:else if thread.status === 'ignored'}
		<p class="text-sm text-muted-foreground">
			Ignored by {thread.answeredBy}: the agent uses its own judgement.
		</p>
	{/if}

	{#if thread.options.length > 0 && thread.status === 'open'}
		<div class="grid gap-1.5">
			<span id="thread-options-label" class="text-xs font-medium text-muted-foreground"
				>Suggested answers</span
			>
			<div class="flex flex-wrap gap-2" role="group" aria-labelledby="thread-options-label">
				{#each thread.options as option (option)}
					{@const selected = draft === option}
					<Button
						variant="outline"
						size="sm"
						aria-pressed={selected}
						class={cn(
							'h-auto min-h-8 max-w-full justify-start px-3 py-1.5 text-left whitespace-normal',
							selected && 'border-brand bg-brand/10 hover:bg-brand/15'
						)}
						onclick={() => pick(option)}
					>
						{option}
					</Button>
				{/each}
			</div>
		</div>
	{/if}

	<Field label="Your reply (markdown)" for="thread-reply" hint="Ctrl or ⌘ + Enter to reply">
		<Textarea
			id="thread-reply"
			bind:ref={replyEl}
			bind:value={draft}
			{onkeydown}
			{@attach imageUpload(() => imageTarget)}
			rows={3}
		/>
	</Field>
	<div class="flex flex-wrap items-center justify-end gap-2">
		<AddImageButton textarea={replyEl} target={imageTarget} class="mr-auto" />
		<Button variant="outline" size="sm" onclick={reply} disabled={busy || text === ''}>Reply</Button
		>
		{#if thread.status !== 'answered'}
			<Button size="sm" onclick={answer} disabled={busy || text === ''}
				>Reply & mark answered</Button
			>
		{/if}
	</div>
</div>
