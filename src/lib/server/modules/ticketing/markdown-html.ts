import { Marked } from 'marked';

const escape = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const marked = new Marked({
	gfm: true,
	renderer: {
		// Task descriptions come from agents; raw HTML is shown as text instead of reaching the remote tracker.
		html: ({ text }) => escape(text)
	}
});

export function markdownToHtml(markdown: string): string {
	return (marked.parse(markdown, { async: false }) as string).trim();
}
