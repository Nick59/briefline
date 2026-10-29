import { escapeHtml, type MarkdownExtension } from '../extension.ts';

let sequence = 0;
let loader: Promise<typeof import('mermaid').default> | undefined;

/** Mermaid is large, so it is only downloaded when a page shows a diagram. */
function loadMermaid() {
	loader ??= import('mermaid').then((module) => module.default);
	return loader;
}

const isDark = () => document.documentElement.classList.contains('dark');

async function renderAll(node: HTMLElement) {
	const figures = [...node.querySelectorAll<HTMLElement>('figure.md-mermaid')];
	if (figures.length === 0) return;
	const mermaid = await loadMermaid();
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: 'strict',
		theme: isDark() ? 'dark' : 'neutral',
		fontFamily: getComputedStyle(node).fontFamily
	});

	for (const figure of figures) {
		const source = figure.querySelector('code')?.textContent ?? '';
		const output = figure.querySelector<HTMLElement>('.md-mermaid-output')!;
		try {
			// parse first: render() leaves stray error elements in the page when the source is invalid.
			await mermaid.parse(source);
			const { svg } = await mermaid.render(`md-mermaid-${++sequence}`, source);
			output.innerHTML = svg;
			figure.dataset.state = 'ready';
		} catch (error) {
			output.textContent = `Diagram error: ${error instanceof Error ? error.message : String(error)}`;
			figure.dataset.state = 'error';
		}
	}
}

/**
 * Renders ```mermaid code blocks as diagrams (flowcharts, sequence, state, ER, gantt...).
 * The source stays in the page, so it shows until the diagram is ready and when it is invalid.
 */
export const mermaidDiagrams: MarkdownExtension = {
	name: 'mermaid',
	marked: {
		renderer: {
			code({ text, lang }) {
				if ((lang ?? '').trim().split(/\s/)[0] !== 'mermaid') return false;
				return `<figure class="md-mermaid" data-state="pending"><div class="md-mermaid-output" role="img" aria-label="Diagram"></div><pre class="md-mermaid-source"><code>${escapeHtml(text)}</code></pre></figure>\n`;
			}
		}
	},
	enhance(node) {
		void renderAll(node);
		// Re-render with the matching theme when the user switches light/dark mode.
		const observer = new MutationObserver(() => void renderAll(node));
		observer.observe(document.documentElement, { attributeFilter: ['class'] });
		return () => observer.disconnect();
	}
};
