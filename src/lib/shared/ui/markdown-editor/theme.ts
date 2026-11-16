import { EditorView } from '@codemirror/view';

const mono = 'var(--font-mono)';

export const theme = EditorView.theme({
	'&': { backgroundColor: 'transparent', fontSize: '0.875rem' },
	'&.cm-focused': { outline: 'none' },
	'.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.6' },
	'.cm-content': {
		padding: '0.5rem 0.625rem',
		minHeight: 'calc(var(--md-rows, 3) * 1.6em + 1rem)',
		caretColor: 'var(--foreground)'
	},
	'.cm-cursor': { borderLeftColor: 'var(--foreground)' },
	'.cm-placeholder': { color: 'var(--muted-foreground)' },
	'.cm-h1': { fontSize: '1.5em', fontWeight: '600', lineHeight: '1.3' },
	'.cm-h2': { fontSize: '1.3em', fontWeight: '600', lineHeight: '1.3' },
	'.cm-h3': { fontSize: '1.15em', fontWeight: '600' },
	'.cm-h4, .cm-h5, .cm-h6': { fontWeight: '600' },
	'.cm-strong': { fontWeight: '600' },
	'.cm-em': { fontStyle: 'italic' },
	'.cm-strike': { textDecoration: 'line-through' },
	'.cm-inline-code': {
		fontFamily: mono,
		fontSize: '0.9em',
		backgroundColor: 'var(--muted)',
		borderRadius: '0.25rem',
		padding: '0.1em 0.3em'
	},
	'.cm-link': { color: 'var(--brand)', textDecoration: 'underline' },
	'.cm-quote': {
		borderLeft: '3px solid var(--border)',
		paddingLeft: '0.75rem',
		color: 'var(--muted-foreground)'
	},
	'.cm-codeblock': {
		fontFamily: mono,
		fontSize: '0.85em',
		backgroundColor: 'var(--muted)',
		padding: '0 0.625rem'
	},
	'.cm-bullet': { display: 'inline-block', width: '1em', color: 'var(--muted-foreground)' },
	'.cm-task-checkbox': {
		margin: '0 0.4em 0 0',
		verticalAlign: 'middle',
		accentColor: 'var(--brand)',
		cursor: 'pointer'
	},
	'.cm-table-widget': { cursor: 'text', padding: '0.25rem 0' },
	'.cm-table-widget table': { margin: '0' },
	'.cm-tooltip.cm-tooltip-autocomplete': {
		backgroundColor: 'var(--popover)',
		color: 'var(--popover-foreground)',
		border: '1px solid var(--border)',
		borderRadius: 'var(--radius-md)',
		boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
		overflow: 'hidden'
	},
	'.cm-tooltip.cm-tooltip-autocomplete > ul': {
		fontFamily: 'inherit',
		minWidth: '14rem',
		maxHeight: '16rem'
	},
	'.cm-tooltip-autocomplete > ul > li': {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '0.3rem 0.5rem'
	},
	'.cm-tooltip-autocomplete > ul > li[aria-selected]': {
		backgroundColor: 'var(--accent)',
		color: 'var(--accent-foreground)'
	},
	'.cm-completionDetail': {
		marginLeft: 'auto',
		fontStyle: 'normal',
		opacity: '0.6',
		fontSize: '0.8em'
	},
	'.cm-slash-icon': { order: '-1', display: 'inline-flex', color: 'var(--muted-foreground)' },
	'.cm-slash-icon svg': { width: '1rem', height: '1rem' },
	'.cm-tooltip.cm-completionInfo': {
		backgroundColor: 'var(--popover)',
		color: 'var(--popover-foreground)',
		border: '1px solid var(--border)',
		borderRadius: 'var(--radius-md)',
		padding: '0.25rem 0.625rem',
		maxWidth: '18rem',
		maxHeight: '12rem',
		overflow: 'auto'
	}
});
