import { describe, expect, it } from 'vitest';
import { insertBlock } from './diagram-templates.ts';

describe('insertBlock', () => {
	it('inserts a mermaid block on its own lines at the cursor', () => {
		const text = '# Spec\nIntro';
		const result = insertBlock(text, text.length, 'flowchart LR\n  a --> b');
		expect(result.text).toBe('# Spec\nIntro\n\n```mermaid\nflowchart LR\n  a --> b\n```\n\n');
		expect(result.cursor).toBe(result.text.length);
	});

	it('works in an empty document and before existing text', () => {
		expect(insertBlock('', 0, 'x').text).toBe('```mermaid\nx\n```\n\n');
		expect(insertBlock('next', 0, 'x').text).toBe('```mermaid\nx\n```\n\nnext');
	});
});
