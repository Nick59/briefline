import { Marked } from 'marked';
import { escapeHtml, safeUrl, type MarkdownExtension } from './extension.ts';

/**
 * Markdown from AI agents is untrusted. The base safety layer escapes every raw HTML
 * token and drops links and images with unsafe protocols (javascript:, data:, ...).
 * Extensions run before it and may only add HTML they build themselves.
 */
const safety: MarkdownExtension = {
	name: 'safety',
	marked: {
		renderer: {
			html({ text }) {
				return escapeHtml(text);
			},
			link({ href, title, tokens }) {
				const label = this.parser.parseInline(tokens);
				const url = safeUrl(href);
				if (!url) return label;
				const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
				return `<a href="${escapeHtml(url)}"${titleAttr}>${label}</a>`;
			},
			image({ href, title, text }) {
				const url = safeUrl(href);
				if (!url) return escapeHtml(text);
				const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
				return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy" />`;
			}
		}
	}
};

export interface MarkdownRenderer {
	render(source: string): string;
	extensions: MarkdownExtension[];
}

export function createMarkdownRenderer(extensions: MarkdownExtension[]): MarkdownRenderer {
	const marked = new Marked({ gfm: true, async: false });
	// Marked gives later extensions priority, so the safety layer goes last.
	for (const extension of [...extensions, safety]) {
		if (extension.marked) marked.use(extension.marked);
	}
	return {
		extensions,
		render(source) {
			let html = marked.parse(source) as string;
			for (const extension of extensions) html = extension.postprocess?.(html) ?? html;
			return html;
		}
	};
}
