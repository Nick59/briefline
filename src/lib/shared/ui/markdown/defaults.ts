import type { MarkdownExtension } from './extension.ts';
import { callouts } from './extensions/callouts.ts';
import { codeBlocks } from './extensions/code-blocks.ts';
import { externalLinks } from './extensions/external-links.ts';
import { headingAnchors } from './extensions/heading-anchors.ts';
import { mermaidDiagrams } from './extensions/mermaid.ts';
import { taskLists } from './extensions/task-lists.ts';

export const defaultMarkdownExtensions: MarkdownExtension[] = [
	callouts,
	headingAnchors,
	codeBlocks,
	taskLists,
	externalLinks,
	// After codeBlocks: marked gives later renderers priority, and this one only claims mermaid blocks.
	mermaidDiagrams
];
