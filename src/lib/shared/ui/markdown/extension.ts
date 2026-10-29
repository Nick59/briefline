import type { MarkedExtension } from 'marked';
import type { Attachment } from 'svelte/attachments';

/**
 * A markdown extension can change parsing/rendering (marked), post-process the HTML string,
 * and enhance the rendered DOM in the browser (for copy buttons, diagrams, embeds...).
 */
export interface MarkdownExtension {
	name: string;
	marked?: MarkedExtension;
	postprocess?: (html: string) => string;
	enhance?: Attachment<HTMLElement>;
}

export function escapeHtml(text: string): string {
	return text.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);
}

const SAFE_URL = /^(https?:|mailto:|#|\/|\.{0,2}\/|[^:]*$)/i;

export function safeUrl(href: string | null | undefined): string | null {
	if (!href) return null;
	const trimmed = href.trim();
	return SAFE_URL.test(trimmed) ? trimmed : null;
}
