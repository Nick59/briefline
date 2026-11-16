import { CompletionContext } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { BASE_COMMANDS, slashCompletionSource } from './slash-commands.ts';

const source = slashCompletionSource(BASE_COMMANDS);

function complete(text: string) {
	const pos = text.indexOf('|');
	const doc = text.replace('|', '');
	const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
	ensureSyntaxTree(state, doc.length, 1000);
	const result = source(new CompletionContext(state, pos, false));
	return result && { from: result.from, labels: result.options.map((o) => o.label) };
}

const plain = (name: string) =>
	(BASE_COMMANDS.find((c) => c.name === name)!.apply as string).replace(/\$\{[^}]*\}/g, '');

describe('slashCompletionSource', () => {
	it('triggers at line start and after whitespace', () => {
		expect(complete('/|')?.from).toBe(0);
		expect(complete('text\n  /ta|')?.from).toBe(7);
		expect(complete('see /ta|')?.from).toBe(4);
	});

	it('does not trigger mid-word, in code or in a URL', () => {
		expect(complete('a/b|')).toBeNull();
		expect(complete('```\n/ta|\n```')).toBeNull();
		expect(complete('`x /ta|`')).toBeNull();
		expect(complete('[a](https://x.dev/ta|)')).toBeNull();
	});

	it('filters by name, label and keyword prefix', () => {
		expect(complete('/ta|')?.labels).toEqual(['Table']);
		expect(complete('/to|')?.labels).toEqual(['Todo']);
		expect(complete('/head|')?.labels).toEqual(['Heading 1', 'Heading 2', 'Heading 3']);
		expect(complete('/checkbox|')?.labels).toEqual(['Todo']);
		expect(complete('/zzz|')?.labels).toEqual([]);
	});

	it('has templates for todo and table', () => {
		expect(plain('todo')).toBe('- [ ] ');
		expect(plain('table')).toBe('|  |  |\n| --- | --- |\n|  |  |\n|  |  |');
	});
});
