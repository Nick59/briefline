import { ensureSyntaxTree } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { buildDecorations } from './live-preview.ts';

function decorate(source: string) {
	const doc = source.replace('^', '');
	const at = source.indexOf('^');
	const state = EditorState.create({
		doc,
		selection: { anchor: at === -1 ? doc.length : at },
		extensions: [markdown({ base: markdownLanguage })]
	});
	ensureSyntaxTree(state, doc.length, 1000);
	const hidden: string[] = [];
	const classes: string[] = [];
	let widgets = 0;
	let tables = 0;
	buildDecorations(state).between(0, doc.length, (from, to, value) => {
		if (value.spec.block) tables++;
		else if (value.spec.widget) widgets++;
		else if (value.point && to > from) hidden.push(doc.slice(from, to));
		if (value.spec.class) classes.push(value.spec.class);
	});
	return { hidden, classes, widgets, tables };
}

describe('buildDecorations', () => {
	it('hides heading, bold and link syntax on other lines', () => {
		const { hidden, classes } = decorate('# Title\n\n**bold** [site](https://x.dev)\n\n^end');
		expect(hidden).toEqual(['# ', '**', '**', '[', '](https://x.dev)']);
		expect(classes).toEqual(expect.arrayContaining(['cm-h1', 'cm-strong', 'cm-link']));
	});

	it('keeps the markers raw on the line with the cursor', () => {
		expect(decorate('# Ti^tle').hidden).toEqual([]);
		expect(decorate('**bo^ld**').hidden).toEqual([]);
	});

	it('renders task checkboxes and bullets as widgets away from the cursor', () => {
		expect(decorate('- [ ] one\n- [x] two\n\n^end')).toMatchObject({
			hidden: ['- ', '- '],
			widgets: 2
		});
		expect(decorate('- a\n\n^end').widgets).toBe(1);
		expect(decorate('- [ ] o^ne').widgets).toBe(0);
	});

	it('never hides the fences of a code block', () => {
		const { hidden, classes } = decorate('```mermaid\ngraph TD\n```\n\n^end');
		expect(hidden).toEqual([]);
		expect(classes.filter((c) => c === 'cm-codeblock')).toHaveLength(3);
	});

	it('renders a table as a block away from the cursor, raw inside it', () => {
		const table = '| a | b |\n| - | - |\n| 1 | 2 |';
		expect(decorate(`${table}\n\n^end`).tables).toBe(1);
		expect(decorate('| a | b |\n| - | - |\n| 1 ^| 2 |').tables).toBe(0);
		expect(decorate(`${table}\n\n^end`).hidden).toEqual([]);
	});

	it('keeps a table without a delimiter row raw', () => {
		expect(decorate('| a | b |\n| 1 | 2 |\n\n^end').tables).toBe(0);
	});
});
