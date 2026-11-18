<script lang="ts">
	import { untrack } from 'svelte';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
	import { EditorState, Prec, type Extension } from '@codemirror/state';
	import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view';
	import { cn } from '#lib/shared/lib/utils.ts';
	import { BASE_COMMANDS, slashCommands, type SlashCommand } from './slash-commands.ts';
	import { indentListItems, insertLink, toggleTask, toggleWrap } from './commands.ts';
	import { livePreview } from './live-preview.ts';
	import { theme } from './theme.ts';

	interface Props {
		value: string;
		id?: string;
		placeholder?: string;
		minRows?: number;
		maxlength?: number;
		class?: string;
		'aria-label'?: string;
		/** Called on Ctrl or ⌘ + Enter. */
		onsubmit?: () => void;
		extensions?: Extension[];
		/** Slash-menu commands added after the built-in ones. */
		commands?: SlashCommand[];
		view?: EditorView | null;
	}

	let {
		value = $bindable(''),
		id,
		placeholder,
		minRows = 3,
		maxlength,
		class: className,
		'aria-label': ariaLabel,
		onsubmit,
		extensions = [],
		commands = [],
		view = $bindable(null)
	}: Props = $props();

	// The editor is built once; later changes to these props are not applied.
	function mount(parent: HTMLElement) {
		const created = new EditorView({
			parent,
			state: EditorState.create({
				doc: untrack(() => value),
				extensions: untrack(() => [
					history(),
					// Before the markdown keymap so Enter and Tab accept a completion while the menu is open.
					slashCommands([...BASE_COMMANDS, ...commands]),
					Prec.highest(
						keymap.of([
							{ key: 'Mod-b', run: toggleWrap('**'), stopPropagation: true },
							{ key: 'Mod-i', run: toggleWrap('*'), stopPropagation: true },
							{ key: 'Mod-k', run: insertLink, stopPropagation: true },
							{ key: 'Mod-l', run: toggleTask },
							{ key: 'Tab', run: indentListItems(1) },
							{ key: 'Shift-Tab', run: indentListItems(-1) },
							{
								key: 'Mod-Enter',
								run: () => {
									if (!onsubmit) return false;
									onsubmit();
									return true;
								}
							}
						])
					),
					markdown({ base: markdownLanguage }),
					keymap.of([...defaultKeymap, ...historyKeymap]),
					EditorView.lineWrapping,
					placeholder ? placeholderExtension(placeholder) : [],
					EditorView.contentAttributes.of({
						...(id && { id }),
						...(ariaLabel && { 'aria-label': ariaLabel }),
						'aria-multiline': 'true'
					}),
					maxlength === undefined
						? []
						: EditorState.changeFilter.of(
								(tr) =>
									!tr.docChanged ||
									tr.newDoc.length <= maxlength ||
									tr.newDoc.length <= tr.startState.doc.length
							),
					livePreview,
					theme,
					EditorView.updateListener.of((update) => {
						if (update.docChanged) value = update.state.doc.toString();
					}),
					extensions
				])
			})
		});
		view = created;
		return () => {
			created.destroy();
			view = null;
		};
	}

	$effect(() => {
		const next = value;
		if (view && next !== view.state.doc.toString()) {
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
		}
	});
</script>

<div
	{@attach mount}
	style:--md-rows={minRows}
	class={cn(
		'w-full min-w-0 rounded-lg border border-input bg-transparent transition-colors has-[.cm-focused]:border-ring has-[.cm-focused]:ring-3 has-[.cm-focused]:ring-ring/50 dark:bg-input/30',
		className
	)}
></div>
