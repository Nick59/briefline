import WorkflowIcon from '@lucide/svelte/icons/workflow';
import type { SlashCommand } from '#lib/shared/ui/markdown-editor/index.ts';
import { DIAGRAM_TEMPLATES, insertBlock } from './diagram-templates.ts';

export const diagramCommands: SlashCommand[] = DIAGRAM_TEMPLATES.map((template) => ({
	name: template.id,
	label: template.label,
	detail: 'Diagram',
	icon: WorkflowIcon,
	keywords: ['diagram', 'mermaid'],
	apply(view, from, to) {
		const doc = view.state.doc.toString();
		const rest = doc.slice(0, from) + doc.slice(to);
		const result = insertBlock(rest, from, template.source);
		const insert = result.text.slice(from, result.text.length - (rest.length - from));
		view.dispatch({
			changes: { from, to, insert },
			selection: { anchor: from + insert.length },
			scrollIntoView: true
		});
	}
}));
