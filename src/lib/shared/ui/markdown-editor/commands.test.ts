import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
	indentListItems,
	insertLink,
	toggleCode,
	toggleTask,
	toggleLinePrefix,
	toggleWrap
} from './commands.ts';

/** Runs a command on `doc`; `|` marks the cursor, or a pair of `|` the selection. */
function run(source: string, command: StateCommand) {
	const first = source.indexOf('|');
	const second = source.indexOf('|', first + 1);
	const doc = source.replaceAll('|', '');
	const anchor = Math.max(first, 0);
	const head = second === -1 ? anchor : second - 1;
	let state = EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });
	const handled = command({
		state,
		dispatch: (tr) => {
			state = tr.state;
		}
	});
	const { from, to } = state.selection.main;
	const text = state.doc.toString();
	const marked =
		from === to
			? text.slice(0, from) + '|' + text.slice(from)
			: text.slice(0, from) + '|' + text.slice(from, to) + '|' + text.slice(to);
	return { handled, marked, text };
}

describe('toggleWrap', () => {
	it('wraps and unwraps a selection', () => {
		const wrapped = run('say |hi| now', toggleWrap('**'));
		expect(wrapped.marked).toBe('say **|hi|** now');
		expect(run(wrapped.marked, toggleWrap('**')).text).toBe('say hi now');
	});

	it('wraps an empty selection with the cursor between the markers', () => {
		expect(run('a |', toggleWrap('*')).marked).toBe('a *|*');
	});

	it('unwraps when the selection includes the markers', () => {
		expect(run('|**hi**|', toggleWrap('**')).text).toBe('hi');
	});

	it('does not read half of a bold pair as italic', () => {
		expect(run('**|hi|**', toggleWrap('*')).text).toBe('***hi***');
	});
});

describe('toggleLinePrefix', () => {
	it('adds then removes a prefix', () => {
		const added = run('|text', toggleLinePrefix('quote'));
		expect(added.text).toBe('> text');
		expect(run(added.text, toggleLinePrefix('quote')).text).toBe('text');
	});

	it('replaces another prefix instead of stacking', () => {
		expect(run('- |item', toggleLinePrefix('task')).text).toBe('- [ ] item');
		expect(run('## |title', toggleLinePrefix('bullet')).text).toBe('- title');
	});

	it('numbers each line of an ordered list and keeps indentation', () => {
		expect(run('|a\n  b|', toggleLinePrefix('ordered')).text).toBe('1. a\n  2. b');
	});
});

describe('toggleTask', () => {
	it('flips an existing checkbox', () => {
		expect(run('- [ ] |a', toggleTask).text).toBe('- [x] a');
		expect(run('- [x] |a', toggleTask).text).toBe('- [ ] a');
	});

	it('turns a plain line into a task', () => {
		expect(run('|a', toggleTask).text).toBe('- [ ] a');
	});
});

describe('insertLink', () => {
	it('wraps the selection and selects the url', () => {
		expect(run('|site|', insertLink).marked).toBe('[site](|https://|)');
	});
});

describe('indentListItems', () => {
	it('indents list lines only', () => {
		expect(run('- |a', indentListItems(1)).text).toBe('  - a');
		expect(run('|plain', indentListItems(1)).handled).toBe(false);
	});
});

describe('toggleCode', () => {
	it('wraps a single-line selection with one backtick', () => {
		expect(run('say |hi| now', toggleCode).marked).toBe('say `|hi|` now');
	});

	it('turns a multi-line selection into a fenced block', () => {
		expect(run('|a\nb|', toggleCode).text).toBe('```\na\nb\n```');
	});

	it('expands the selection to the full lines', () => {
		expect(run('x|x\nyy|y', toggleCode).text).toBe('```\nxx\nyyy\n```');
	});

	it('unwraps a fenced block when run again', () => {
		const fenced = run('|a\nb|', toggleCode);
		const again = run('|' + fenced.text + '|', toggleCode);
		expect(again.marked).toBe('|a\nb|');
	});

	it('inserts an empty fence on an empty line', () => {
		expect(run('|', toggleCode).marked).toBe('```\n|\n```');
	});

	it('pads with blank lines when the surrounding lines have text', () => {
		expect(run('top\n|a\nb|\nbottom', toggleCode).text).toBe('top\n\n```\na\nb\n```\n\nbottom');
	});
});
