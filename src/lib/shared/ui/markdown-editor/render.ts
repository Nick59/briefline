import { createMarkdownRenderer, taskLists } from '#lib/shared/ui/markdown/index.ts';

export const renderMarkdown = createMarkdownRenderer([taskLists]).render;
