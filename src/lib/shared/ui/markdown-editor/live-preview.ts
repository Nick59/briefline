import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { renderMarkdown } from './render.ts';

class CheckboxWidget extends WidgetType {
	constructor(readonly checked: boolean) {
		super();
	}

	eq(other: CheckboxWidget) {
		return other.checked === this.checked;
	}

	toDOM(view: EditorView) {
		const box = document.createElement('input');
		box.type = 'checkbox';
		box.checked = this.checked;
		box.className = 'cm-task-checkbox';
		box.tabIndex = -1;
		// Keeps the editor selection from jumping to the clicked checkbox.
		box.addEventListener('mousedown', (event) => event.preventDefault());
		box.addEventListener('click', () => {
			// The widget DOM is reused across edits, so its position is looked up when clicked.
			const at = view.posAtDOM(box);
			const mark = view.state.doc.sliceString(at + 1, at + 2);
			view.dispatch({ changes: { from: at + 1, to: at + 2, insert: mark === ' ' ? 'x' : ' ' } });
		});
		return box;
	}

	ignoreEvent() {
		return false;
	}
}

class BulletWidget extends WidgetType {
	eq() {
		return true;
	}

	toDOM() {
		const bullet = document.createElement('span');
		bullet.className = 'cm-bullet';
		bullet.textContent = '•';
		return bullet;
	}
}

class TableWidget extends WidgetType {
	constructor(readonly source: string) {
		super();
	}

	eq(other: TableWidget) {
		return other.source === this.source;
	}

	toDOM(view: EditorView) {
		const box = document.createElement('div');
		box.className = 'cm-table-widget md prose prose-sm max-w-none dark:prose-invert';
		// renderMarkdown escapes raw HTML and unsafe URLs.
		box.innerHTML = renderMarkdown(this.source);
		box.addEventListener('mousedown', (event) => {
			event.preventDefault();
			const start = view.state.doc.lineAt(view.posAtDOM(box)).number;
			const row = (event.target as Element).closest('tr');
			const index = row ? [...box.querySelectorAll('tr')].indexOf(row) : 0;
			// Line 0 is the header, line 1 the delimiter row, body rows follow.
			const line = view.state.doc.line(
				Math.min(start + (index > 0 ? index + 1 : 0), view.state.doc.lines)
			);
			view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
			view.focus();
		});
		return box;
	}

	ignoreEvent() {
		return true;
	}
}

const hidden = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const checkboxes = [false, true].map((checked) =>
	Decoration.replace({ widget: new CheckboxWidget(checked) })
);
const lineClass = (name: string) => Decoration.line({ class: name });
const markClass = (name: string) => Decoration.mark({ class: name });

type SyntaxNode = ReturnType<typeof syntaxTree>['topNode'];

const BLOCK_MARKS = new Set(['HeaderMark', 'QuoteMark']);
const INLINE_MARKS = new Set(['EmphasisMark', 'StrikethroughMark']);
const INLINE_CLASSES: Record<string, string> = {
	StrongEmphasis: 'cm-strong',
	Emphasis: 'cm-em',
	Strikethrough: 'cm-strike',
	InlineCode: 'cm-inline-code'
};

export function buildDecorations(state: EditorState): DecorationSet {
	const { doc } = state;
	const out: Range<Decoration>[] = [];
	const tree = ensureSyntaxTree(state, doc.length, 20) ?? syntaxTree(state);

	const isActive = (from: number, to: number) => {
		const first = doc.lineAt(from).from;
		const last = doc.lineAt(to).to;
		return state.selection.ranges.some((r) => r.from <= last && r.to >= first);
	};
	// Block markers take their trailing space along, so a hidden "# " leaves no indent.
	const hide = (from: number, to: number, withSpace = false) => {
		if (isActive(from, to)) return;
		if (withSpace && doc.sliceString(to, to + 1) === ' ') to += 1;
		out.push(hidden.range(from, to));
	};
	const lines = (node: SyntaxNode, cls: string) => {
		for (let n = doc.lineAt(node.from).number; n <= doc.lineAt(node.to).number; n++) {
			out.push(lineClass(cls).range(doc.line(n).from));
		}
	};

	{
		tree.iterate({
			enter(ref) {
				const node = ref.node;
				const name = ref.name;
				if (name === 'Table') {
					if (isActive(ref.from, ref.to)) return;
					out.push(
						Decoration.replace({
							widget: new TableWidget(doc.sliceString(ref.from, ref.to)),
							block: true
						}).range(ref.from, ref.to)
					);
					return false;
				}
				const heading = /^ATXHeading([1-6])$/.exec(name);
				if (heading) lines(node, `cm-h${heading[1]}`);
				else if (name === 'FencedCode') lines(node, 'cm-codeblock');
				else if (name === 'Blockquote') lines(node, 'cm-quote');
				else if (INLINE_CLASSES[name]) {
					out.push(markClass(INLINE_CLASSES[name]).range(ref.from, ref.to));
				} else if (BLOCK_MARKS.has(name)) hide(ref.from, ref.to, true);
				else if (INLINE_MARKS.has(name)) hide(ref.from, ref.to);
				else if (name === 'CodeMark' && node.parent?.name === 'InlineCode') hide(ref.from, ref.to);
				else if (name === 'Link') {
					const marks = node.getChildren('LinkMark');
					if (marks.length >= 2) {
						out.push(markClass('cm-link').range(marks[0].to, marks[1].from));
						hide(marks[0].from, marks[0].to);
						if (!isActive(ref.from, ref.to)) out.push(hidden.range(marks[1].from, ref.to));
					}
					return false;
				} else if (name === 'TaskMarker') {
					if (!isActive(ref.from, ref.to)) {
						const checked = doc.sliceString(ref.from + 1, ref.from + 2) !== ' ';
						out.push(checkboxes[Number(checked)].range(ref.from, ref.to));
					}
				} else if (name === 'ListMark' && node.parent?.parent?.name === 'BulletList') {
					if (node.nextSibling?.name === 'Task') hide(ref.from, ref.to, true);
					else if (!isActive(ref.from, ref.to)) out.push(bullet.range(ref.from, ref.to));
				}
			}
		});
	}
	return Decoration.set(out, true);
}

// Block decorations are only allowed from a state field, not a view plugin.
export const livePreview = StateField.define<DecorationSet>({
	create: buildDecorations,
	update(value, tr) {
		return tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState)
			? buildDecorations(tr.state)
			: value;
	},
	provide: (field) => EditorView.decorations.from(field)
});
