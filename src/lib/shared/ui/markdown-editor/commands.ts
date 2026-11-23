import { indentLess, indentMore } from '@codemirror/commands';
import { EditorSelection, type ChangeSpec, type StateCommand } from '@codemirror/state';

export type LineKind = 'heading' | 'quote' | 'bullet' | 'ordered' | 'task';

const ANY_PREFIX = /^(?:#{1,6} |> |[-*+] \[[ xX]\] |[-*+] |\d+[.)] )/;
const KINDS: Record<LineKind, { has: RegExp; make: (index: number) => string }> = {
	heading: { has: /^#{1,6} /, make: () => '## ' },
	quote: { has: /^> /, make: () => '> ' },
	bullet: { has: /^[-*+] (?!\[[ xX]\] )/, make: () => '- ' },
	ordered: { has: /^\d+[.)] /, make: (i) => `${i + 1}. ` },
	task: { has: /^[-*+] \[[ xX]\] /, make: () => '- [ ] ' }
};
const LIST_LINE = /^\s*(?:[-*+]|\d+[.)]) /;

/** Lines touched by the selection, each with its indentation length. */
function selectedLines(state: Parameters<StateCommand>[0]['state']) {
	const seen = new Set<number>();
	const lines = [];
	for (const range of state.selection.ranges) {
		const last = state.doc.lineAt(range.to).number;
		for (let n = state.doc.lineAt(range.from).number; n <= last; n++) {
			if (seen.has(n)) continue;
			seen.add(n);
			const line = state.doc.line(n);
			lines.push({ line, indent: /^\s*/.exec(line.text)![0].length });
		}
	}
	return lines;
}

export const toggleWrap =
	(marker: string): StateCommand =>
	({ state, dispatch }) => {
		const size = marker.length;
		dispatch(
			state.update(
				state.changeByRange((range) => {
					const text = state.sliceDoc(range.from, range.to);
					const wrapped = (from: number, to: number) =>
						state.sliceDoc(Math.max(0, from), to) === marker;
					// A single-character marker must not match half of a doubled one, as in "**bold**".
					const doubled =
						size === 1 &&
						(wrapped(range.from - 2, range.from - 1) || wrapped(range.to + 1, range.to + 2));
					if (
						!doubled &&
						wrapped(range.from - size, range.from) &&
						wrapped(range.to, range.to + size)
					) {
						return {
							changes: [
								{ from: range.from - size, to: range.from },
								{ from: range.to, to: range.to + size }
							],
							range: EditorSelection.range(range.from - size, range.to - size)
						};
					}
					if (text.length >= size * 2 && text.startsWith(marker) && text.endsWith(marker)) {
						return {
							changes: { from: range.from, to: range.to, insert: text.slice(size, -size) },
							range: EditorSelection.range(range.from, range.to - size * 2)
						};
					}
					return {
						changes: [
							{ from: range.from, insert: marker },
							{ from: range.to, insert: marker }
						],
						range: EditorSelection.range(range.from + size, range.to + size)
					};
				}),
				{ userEvent: 'input', scrollIntoView: true }
			)
		);
		return true;
	};

const FENCE = '```';

export const toggleCode: StateCommand = (target) => {
	const { state } = target;
	const isEmptyLine = (from: number, to: number) =>
		from === to && state.doc.lineAt(from).text === '';
	const singleLine = (from: number, to: number) =>
		state.doc.lineAt(from).number === state.doc.lineAt(to).number;
	if (
		state.selection.ranges.every(
			(range) => singleLine(range.from, range.to) && !isEmptyLine(range.from, range.to)
		)
	) {
		return toggleWrap('`')(target);
	}
	target.dispatch(
		state.update(
			state.changeByRange((range) => {
				if (isEmptyLine(range.from, range.to)) {
					return {
						changes: { from: range.from, insert: `${FENCE}\n\n${FENCE}` },
						range: EditorSelection.cursor(range.from + FENCE.length + 1)
					};
				}
				if (singleLine(range.from, range.to)) {
					return {
						changes: [
							{ from: range.from, insert: '`' },
							{ from: range.to, insert: '`' }
						],
						range: EditorSelection.range(range.from + 1, range.to + 1)
					};
				}
				const first = state.doc.lineAt(range.from);
				const last = state.doc.lineAt(range.to);
				if (
					first.text.startsWith(FENCE) &&
					last.text.trim() === FENCE &&
					last.number > first.number
				) {
					const changes =
						last.number === first.number + 1
							? [{ from: first.from, to: last.to }]
							: [
									{ from: first.from, to: first.to + 1 },
									{ from: last.from - 1, to: last.to }
								];
					return {
						changes,
						range: EditorSelection.range(
							first.from,
							Math.max(first.from, last.from - 1 - (first.to + 1 - first.from))
						)
					};
				}
				// A blank line keeps the fence from being read as part of the neighbouring paragraph.
				const before =
					first.number > 1 && state.doc.line(first.number - 1).text.trim() !== '' ? '\n' : '';
				const after =
					last.number < state.doc.lines && state.doc.line(last.number + 1).text.trim() !== ''
						? '\n'
						: '';
				const shift = before.length + FENCE.length + 1;
				return {
					changes: [
						{ from: first.from, insert: `${before}${FENCE}\n` },
						{ from: last.to, insert: `\n${FENCE}${after}` }
					],
					range: EditorSelection.range(first.from + shift, last.to + shift)
				};
			}),
			{ userEvent: 'input', scrollIntoView: true }
		)
	);
	return true;
};

export const toggleLinePrefix =
	(kind: LineKind): StateCommand =>
	({ state, dispatch }) => {
		const lines = selectedLines(state);
		const filled = lines.filter(({ line }) => line.text.trim() !== '');
		const targets = filled.length > 0 ? filled : lines;
		const { has, make } = KINDS[kind];
		const remove = targets.every(({ line, indent }) => has.test(line.text.slice(indent)));
		const changes: ChangeSpec[] = targets.map(({ line, indent }, index) => {
			const from = line.from + indent;
			const old = ANY_PREFIX.exec(line.text.slice(indent))?.[0].length ?? 0;
			return { from, to: from + old, insert: remove ? '' : make(index) };
		});
		dispatch(state.update({ changes, userEvent: 'input', scrollIntoView: true }));
		return true;
	};

export const toggleTask: StateCommand = ({ state, dispatch }) => {
	const changes: ChangeSpec[] = [];
	let index = 0;
	for (const { line, indent } of selectedLines(state)) {
		const box = /^([-*+] \[)([ xX])\]/.exec(line.text.slice(indent));
		const from = line.from + indent;
		if (box) {
			const at = from + box[1].length;
			changes.push({ from: at, to: at + 1, insert: box[2] === ' ' ? 'x' : ' ' });
		} else {
			const old = ANY_PREFIX.exec(line.text.slice(indent))?.[0].length ?? 0;
			changes.push({ from, to: from + old, insert: KINDS.task.make(index++) });
		}
	}
	dispatch(state.update({ changes, userEvent: 'input' }));
	return true;
};

export const insertLink: StateCommand = ({ state, dispatch }) => {
	dispatch(
		state.update(
			state.changeByRange((range) => {
				const text = state.sliceDoc(range.from, range.to) || 'text';
				const url = 'https://';
				const start = range.from + text.length + 3;
				return {
					changes: { from: range.from, to: range.to, insert: `[${text}](${url})` },
					range: EditorSelection.range(start, start + url.length)
				};
			}),
			{ userEvent: 'input', scrollIntoView: true }
		)
	);
	return true;
};

export const insertText = (target: Parameters<StateCommand>[0], text: string) =>
	target.dispatch(
		target.state.update(target.state.replaceSelection(text), {
			userEvent: 'input',
			scrollIntoView: true
		})
	);

/** Tab only indents list items, so everywhere else it moves focus out of the editor. */
export const indentListItems =
	(direction: 1 | -1): StateCommand =>
	(target) =>
		selectedLines(target.state).every(({ line }) => LIST_LINE.test(line.text))
			? (direction === 1 ? indentMore : indentLess)(target)
			: false;
