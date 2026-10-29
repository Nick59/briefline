import { escapeHtml, type MarkdownExtension } from '../extension.ts';

/** Labels code blocks with their language and adds a copy button in the browser. */
export const codeBlocks: MarkdownExtension = {
	name: 'code-blocks',
	marked: {
		renderer: {
			code({ text, lang }) {
				const language = (lang ?? '').split(/\s/)[0];
				const label = language ? `<span class="md-code-lang">${escapeHtml(language)}</span>` : '';
				return `<figure class="md-code" data-lang="${escapeHtml(language)}">${label}<pre><code>${escapeHtml(text)}</code></pre></figure>\n`;
			}
		}
	},
	enhance(node) {
		const buttons: HTMLButtonElement[] = [];
		for (const figure of node.querySelectorAll<HTMLElement>('figure.md-code')) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'md-copy';
			button.textContent = 'Copy';
			button.addEventListener('click', async () => {
				await navigator.clipboard.writeText(figure.querySelector('code')?.textContent ?? '');
				button.textContent = 'Copied';
				setTimeout(() => (button.textContent = 'Copy'), 1500);
			});
			figure.append(button);
			buttons.push(button);
		}
		return () => buttons.forEach((b) => b.remove());
	}
};
