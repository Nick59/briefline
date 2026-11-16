import {
	autocompletion,
	snippet,
	type Completion,
	type CompletionContext,
	type CompletionResult
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { mount, type Component } from 'svelte';
import CodeIcon from '@lucide/svelte/icons/code';
import Heading1Icon from '@lucide/svelte/icons/heading-1';
import Heading2Icon from '@lucide/svelte/icons/heading-2';
import Heading3Icon from '@lucide/svelte/icons/heading-3';
import ListIcon from '@lucide/svelte/icons/list';
import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
import MinusIcon from '@lucide/svelte/icons/minus';
import QuoteIcon from '@lucide/svelte/icons/quote';
import SquareCheckIcon from '@lucide/svelte/icons/square-check';
import TableIcon from '@lucide/svelte/icons/table';
import { renderMarkdown } from './render.ts';

export type SlashCommand = {
	name: string;
	label: string;
	detail?: string;
	icon?: Component;
	keywords?: string[];
	/** Markdown shown in the info panel. */
	preview?: string;
	/** Snippet template, or a function that replaces the typed `/word` (from to) itself. */
	apply: string | ((view: EditorView, from: number, to: number) => void);
	/** Inserted on its own line, even when text precedes the slash. */
	block?: boolean;
};

export const BASE_COMMANDS: SlashCommand[] = [
	{
		name: 'todo',
		label: 'Todo',
		detail: 'Checkbox item',
		icon: SquareCheckIcon,
		keywords: ['checkbox', 'check'],
		preview: '- [ ] Write the spec\n- [x] Review it',
		apply: '- [ ] ${}'
	},
	{
		name: 'table',
		label: 'Table',
		detail: '2 columns',
		icon: TableIcon,
		keywords: ['grid'],
		preview: '| Column 1 | Column 2 |\n| --- | --- |\n| a | b |',
		apply: '| ${Column 1} | ${Column 2} |\n| --- | --- |\n| ${} | ${} |\n| ${} | ${} |',
		block: true
	},
	{ name: 'h1', label: 'Heading 1', icon: Heading1Icon, keywords: ['title'], apply: '# ${}' },
	{ name: 'h2', label: 'Heading 2', icon: Heading2Icon, keywords: ['subtitle'], apply: '## ${}' },
	{ name: 'h3', label: 'Heading 3', icon: Heading3Icon, apply: '### ${}' },
	{
		name: 'bullet',
		label: 'Bullet list',
		icon: ListIcon,
		keywords: ['ul', 'unordered'],
		apply: '- ${}'
	},
	{
		name: 'numbered',
		label: 'Numbered list',
		icon: ListOrderedIcon,
		keywords: ['ol', 'ordered'],
		apply: '1. ${}'
	},
	{ name: 'quote', label: 'Quote', icon: QuoteIcon, keywords: ['blockquote'], apply: '> ${}' },
	{
		name: 'code',
		label: 'Code block',
		icon: CodeIcon,
		keywords: ['fence', 'snippet'],
		apply: '```${lang}\n${}\n```',
		block: true
	},
	{
		name: 'divider',
		label: 'Divider',
		icon: MinusIcon,
		keywords: ['hr', 'rule', 'line'],
		apply: '---\n',
		block: true
	}
];

type SyntaxNode = ReturnType<typeof syntaxTree>['topNode'];

const NO_TRIGGER = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'URL', 'Link']);

function matches(command: SlashCommand, query: string) {
	return [command.name, command.label, ...(command.keywords ?? [])].some((text) =>
		text
			.toLowerCase()
			.split(/\s+/)
			.some((word) => word.startsWith(query))
	);
}

export function slashCompletionSource(commands: SlashCommand[]) {
	return (context: CompletionContext): CompletionResult | null => {
		const word = context.matchBefore(/\/\w*/);
		if (!word) return null;
		if (word.from > 0 && !/\s/.test(context.state.sliceDoc(word.from - 1, word.from))) return null;
		let node: SyntaxNode | null = syntaxTree(context.state).resolveInner(word.from, -1);
		for (; node; node = node.parent) if (NO_TRIGGER.has(node.name)) return null;
		const query = word.text.slice(1).toLowerCase();
		return {
			from: word.from,
			filter: false,
			options: commands
				.filter((command) => matches(command, query))
				.map((command): Completion => {
					const { name, apply } = command;
					return {
						label: command.label,
						detail: command.detail ?? `/${name}`,
						type: name,
						info: command.preview ? () => preview(command.preview!) : undefined,
						apply(view, _completion, from, to) {
							if (typeof apply === 'function') return apply(view, from, to);
							const line = view.state.doc.lineAt(from);
							const lead = command.block && line.text.slice(0, from - line.from).trim() ? '\n' : '';
							snippet(lead + apply)(view, null, from, to);
						}
					};
				})
		};
	};
}

function preview(source: string) {
	const node = document.createElement('div');
	node.className = 'md prose prose-sm cm-slash-preview';
	// renderMarkdown escapes raw HTML and unsafe URLs.
	node.innerHTML = renderMarkdown(source);
	return node;
}

export function slashCommands(commands: SlashCommand[]): Extension {
	const icons = new Map(commands.map((command) => [command.name, command.icon]));
	return autocompletion({
		override: [slashCompletionSource(commands)],
		icons: false,
		addToOptions: [
			{
				position: 20,
				render(completion) {
					const icon = icons.get(completion.type ?? '');
					const node = document.createElement('span');
					node.className = 'cm-slash-icon';
					if (icon) mount(icon, { target: node });
					return node;
				}
			}
		]
	});
}
