import type { MarkdownExtension } from '../extension.ts';

export const slugify = (text: string) =>
	text
		.toLowerCase()
		.replace(/<[^>]+>/g, '')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-');

/** Gives headings ids so sections can be linked, e.g. #acceptance-criteria. */
export const headingAnchors: MarkdownExtension = {
	name: 'heading-anchors',
	marked: {
		renderer: {
			heading({ tokens, depth }) {
				const html = this.parser.parseInline(tokens);
				const id = slugify(html);
				return `<h${depth} id="md-${id}"><a class="md-anchor" href="#md-${id}" aria-hidden="true" tabindex="-1">#</a>${html}</h${depth}>\n`;
			}
		}
	}
};
