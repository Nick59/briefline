<script lang="ts">
	import {
		AddImageButton,
		imageCommand,
		imageUploadExtension,
		type ImageTarget
	} from '#lib/features/attachment-upload/index.ts';
	import { FormatToolbar } from '#lib/features/markdown-format/index.ts';
	import { MarkdownEditor } from '#lib/shared/ui/markdown-editor/index.ts';
	import type { EditorView } from '@codemirror/view';
	import BotIcon from '@lucide/svelte/icons/bot';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UserIcon from '@lucide/svelte/icons/user-round';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { ConfirmAction } from '#lib/shared/ui/confirm-action/index.ts';
	import { MarkdownViewer } from '#lib/shared/ui/markdown/index.ts';
	import { RelativeTime } from '#lib/shared/ui/relative-time/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import { cn } from '#lib/shared/lib/utils.ts';
	import type { TaskComment } from '#lib/shared/domain/types.ts';

	interface Props {
		taskId: string;
		comments: TaskComment[];
	}

	let { taskId, comments }: Props = $props();

	let draft = $state('');
	let busy = $state(false);
	let editingId = $state<string | null>(null);
	let editDraft = $state('');
	let draftEl = $state<EditorView | null>(null);
	let editEl = $state<EditorView | null>(null);
	const imageTarget = $derived<ImageTarget>({ type: 'task', id: taskId });

	const text = $derived(draft.trim());
	const editText = $derived(editDraft.trim());

	async function add() {
		if (!text || busy) return;
		busy = true;
		const outcome = await runOperation('add_task_comment', { task: taskId, body: text });
		busy = false;
		if (outcome.ok) draft = '';
	}

	function startEdit(comment: TaskComment) {
		editingId = comment.id;
		editDraft = comment.body;
	}

	async function save(comment: TaskComment) {
		if (!editText || busy) return;
		busy = true;
		const outcome = await runOperation('update_task_comment', {
			comment: comment.id,
			body: editText
		});
		busy = false;
		if (outcome.ok) editingId = null;
	}

	const remove = (comment: TaskComment) =>
		runOperation('delete_task_comment', { comment: comment.id }, { success: 'Deleted comment' });
</script>

<Section title="Comments" count={comments.length}>
	{#if comments.length > 0}
		<ul class="grid gap-3" aria-label="Comments">
			{#each comments as comment (comment.id)}
				{@const human = comment.authorKind === 'human'}
				<li
					class={cn(
						'grid gap-1.5 rounded-lg border-l-2 px-3 py-2',
						human ? 'border-brand bg-brand/5' : 'border-border bg-muted/40'
					)}
				>
					<div class="flex items-center justify-between gap-2">
						<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
							{#if human}<UserIcon class="size-3" />{:else}<BotIcon class="size-3" />{/if}
							<span class="font-medium text-foreground">{comment.author}</span>
							<RelativeTime value={comment.createdAt} />
							{#if comment.updatedAt !== comment.createdAt}<span>· edited</span>{/if}
						</p>
						{#if human && editingId !== comment.id}
							<div class="flex items-center">
								<Button
									variant="ghost"
									size="icon-sm"
									class="text-muted-foreground"
									aria-label="Edit comment"
									onclick={() => startEdit(comment)}><PencilIcon /></Button
								>
								<ConfirmAction
									title="Delete comment?"
									description="This comment is removed for everyone."
									onconfirm={() => remove(comment)}
								>
									{#snippet trigger({ props })}
										<Button
											{...props}
											variant="ghost"
											size="icon-sm"
											class="text-muted-foreground hover:text-danger"
											aria-label="Delete comment"><Trash2Icon /></Button
										>
									{/snippet}
								</ConfirmAction>
							</div>
						{/if}
					</div>
					{#if editingId === comment.id}
						<MarkdownEditor
							id="edit-comment-{comment.id}"
							bind:view={editEl}
							bind:value={editDraft}
							extensions={[imageUploadExtension(() => imageTarget)]}
							commands={[imageCommand(() => imageTarget)]}
							aria-label="Edit comment"
							onsubmit={() => save(comment)}
						/>
						<div class="flex justify-end gap-2">
							<FormatToolbar view={editEl} class="mr-auto" />
							<AddImageButton view={editEl} target={imageTarget} />
							<Button variant="outline" size="sm" onclick={() => (editingId = null)}>Cancel</Button>
							<Button size="sm" disabled={busy || editText === ''} onclick={() => save(comment)}
								>Save</Button
							>
						</div>
					{:else}
						<MarkdownViewer source={comment.body} />
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<div class="grid gap-2">
		<MarkdownEditor
			id="new-comment"
			bind:view={draftEl}
			bind:value={draft}
			extensions={[imageUploadExtension(() => imageTarget)]}
			commands={[imageCommand(() => imageTarget)]}
			placeholder="Write a comment (markdown). Ctrl or ⌘ + Enter to post."
			aria-label="New comment"
			onsubmit={add}
		/>
		<div class="flex flex-wrap justify-end gap-2">
			<FormatToolbar view={draftEl} class="mr-auto" />
			<AddImageButton view={draftEl} target={imageTarget} />
			<Button size="sm" onclick={add} disabled={busy || text === ''}>Comment</Button>
		</div>
	</div>
</Section>
