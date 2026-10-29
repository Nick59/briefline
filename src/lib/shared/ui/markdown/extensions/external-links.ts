import type { MarkdownExtension } from '../extension.ts';

/** Opens links to other sites in a new tab without giving them access to this window. */
export const externalLinks: MarkdownExtension = {
	name: 'external-links',
	postprocess: (html) =>
		html.replace(
			/<a href="(https?:\/\/[^"]+)"/g,
			'<a href="$1" target="_blank" rel="noopener noreferrer"'
		)
};
