import { describe, expect, it } from 'vitest';
import { createMarkdownRenderer } from './renderer.ts';
import { defaultMarkdownExtensions } from './defaults.ts';
import type { MarkdownExtension } from './extension.ts';

const render = (md: string, extra: MarkdownExtension[] = []) =>
	createMarkdownRenderer([...defaultMarkdownExtensions, ...extra]).render(md);

describe('markdown renderer', () => {
	it('escapes raw HTML from untrusted markdown', () => {
		const html = render('<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>');
		expect(html).not.toContain('<img src=x');
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('drops links with unsafe protocols', () => {
		const html = render('[click](javascript:alert(1)) and [ok](https://example.com)');
		expect(html).not.toContain('javascript:');
		expect(html).toContain(
			'<a href="https://example.com" target="_blank" rel="noopener noreferrer">ok</a>'
		);
	});

	it('renders callouts, task lists, code blocks and anchors', () => {
		const html = render(
			'# Title\n\n> [!WARNING]\n> Careful\n\n- [x] done\n\n```ts\nconst a = 1;\n```'
		);
		expect(html).toContain('id="md-title"');
		expect(html).toContain('class="md-callout" data-kind="warning"');
		expect(html).toContain('class="md-check" data-checked="true"');
		expect(html).toContain('<figure class="md-code" data-lang="ts">');
	});

	it('turns mermaid blocks into diagram placeholders and leaves other code alone', () => {
		const html = render(
			'```mermaid\nflowchart LR\n  a --> b<script>\n```\n\n```ts\nconst a = 1;\n```'
		);
		expect(html).toContain('<figure class="md-mermaid" data-state="pending">');
		expect(html).toContain('a --&gt; b&lt;script&gt;');
		expect(html).toContain('<figure class="md-code" data-lang="ts">');
	});

	it('accepts custom extensions', () => {
		const shout: MarkdownExtension = {
			name: 'shout',
			postprocess: (html) => html.replace('hello', 'HELLO')
		};
		expect(render('hello', [shout])).toContain('HELLO');
	});

	it('renders uploaded images as a link to the full image and still drops data: and javascript: images', () => {
		const html = render('![shot](/attachments/3f1c2a5e-1111-4222-8333-444455556666)');
		expect(html).toContain(
			'<a href="/attachments/3f1c2a5e-1111-4222-8333-444455556666" target="_blank" rel="noopener noreferrer"><img src="/attachments/3f1c2a5e-1111-4222-8333-444455556666" alt="shot"'
		);
		const unsafe = render('![a](data:image/png;base64,AAAA) ![b](javascript:alert(1))');
		expect(unsafe).not.toContain('<img');
		expect(unsafe).not.toContain('data:');
	});
});
