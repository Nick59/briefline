<script lang="ts">
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';
	import { RelativeTime } from '#lib/shared/ui/relative-time/index.ts';
	import { pluralize } from '#lib/shared/lib/format.ts';
	import { shorten } from '#lib/shared/lib/question-text.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import type { Tone } from '#lib/shared/config/tokens/index.ts';
	import type { QuestionStatus } from '#lib/shared/domain/constants.ts';
	import type { EpicQuestion } from '#lib/shared/domain/types.ts';

	interface Props {
		threads: EpicQuestion[];
		onselect: (thread: EpicQuestion) => void;
		highlight?: string | null;
	}

	let { threads, onselect, highlight = null }: Props = $props();

	const tones: Record<QuestionStatus, Tone> = {
		open: 'warning',
		answered: 'success',
		ignored: 'neutral'
	};
</script>

<ul class="grid gap-2">
	{#each threads as thread (thread.id)}
		<li>
			<button
				type="button"
				onclick={() => onselect(thread)}
				class={cn(
					'grid w-full cursor-pointer gap-1.5 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
					highlight === thread.id && 'ring-2 ring-ring'
				)}
			>
				<span class="flex items-start justify-between gap-2">
					<span class="min-w-0 font-semibold">{shorten(thread.question, 140)}</span>
					<ToneBadge tone={tones[thread.status]}>{thread.status}</ToneBadge>
				</span>
				<span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
					<span>{thread.askedBy}</span>
					<RelativeTime value={thread.createdAt} />
					<span class="inline-flex items-center gap-1">
						<MessageSquareIcon class="size-3" aria-hidden="true" />
						{pluralize(thread.messages.length, 'reply', 'replies')}
					</span>
				</span>
			</button>
		</li>
	{/each}
</ul>
