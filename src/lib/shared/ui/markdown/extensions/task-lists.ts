import type { MarkdownExtension } from '../extension.ts';

/** Renders "- [ ]" items as read-only checkboxes, styled as acceptance criteria. */
export const taskLists: MarkdownExtension = {
	name: 'task-lists',
	marked: {
		renderer: {
			checkbox({ checked }) {
				return `<span class="md-check" data-checked="${checked}" role="img" aria-label="${checked ? 'done' : 'not done'}"></span>`;
			}
		}
	}
};
