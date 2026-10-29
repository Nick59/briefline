import type { Effort } from '#lib/shared/domain/constants.ts';
import { findTerms } from './glossary.ts';
import {
	firstSentences,
	listItems,
	outline,
	paragraphs,
	plain,
	type Section
} from './markdown-outline.ts';
import type { BriefDraft, BriefInput, BriefTranslator } from './translator.ts';

const TOPICS = {
	why: /\b(why|goal|goals|motivation|context|problem|background|objective|purpose|overview|summary)\b/i,
	changes:
		/\b(scope|change|changes|implementation|approach|solution|plan|tasks?|deliverables?|requirements?|design|steps?)\b/i,
	acceptance:
		/\b(acceptance|criteria|definition of done|dod|success|verification|verify|tests?)\b/i,
	risks: /\b(risks?|caveats?|concerns?|trade-?offs?|limitations?|security|rollback)\b/i,
	questions: /\b(questions?|unknowns?|tbd|open issues?|to decide)\b/i
};

function sectionsAbout(sections: Section[], topic: RegExp) {
	return sections.filter((s) => s.heading && topic.test(s.heading));
}

function itemsAbout(sections: Section[], topic: RegExp, limit: number): string[] {
	return unique(sectionsAbout(sections, topic).flatMap((s) => listItems(s.body))).slice(0, limit);
}

function unique(items: string[]) {
	return [...new Set(items.map((i) => i.trim()).filter(Boolean))];
}

function estimateEffort(score: number): Effort {
	if (score < 6) return 'S';
	if (score < 12) return 'M';
	if (score < 20) return 'L';
	return 'XL';
}

/** Rule-based translation that works offline. It reads common spec headings written by AI agents. */
export class HeuristicTranslator implements BriefTranslator {
	readonly id = 'heuristic';

	async translate({ title, content }: BriefInput): Promise<BriefDraft> {
		const { sections, codeBlocks } = outline(content);
		const allProse = sections.flatMap((s) => paragraphs(s.body));
		const words = content.split(/\s+/).filter(Boolean).length;

		// The intro is the prose before the first sub-heading: the preamble or the body of a level-1 title.
		const intro = sections.filter((s) => s.level <= 1).flatMap((s) => paragraphs(s.body));
		const whySection = sectionsAbout(sections, TOPICS.why).flatMap((s) => [
			...paragraphs(s.body),
			...listItems(s.body)
		]);
		const summarySource = intro[0] ?? whySection[0] ?? allProse[0] ?? '';
		const summary = summarySource
			? firstSentences(summarySource, 2)
			: `This document describes "${plain(title)}".`;
		const whyItMatters = whySection
			.filter((p) => p !== summarySource)
			.slice(0, 3)
			.map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
			.join(' ');

		let whatChanges = itemsAbout(sections, TOPICS.changes, 8);
		if (whatChanges.length === 0) {
			whatChanges = unique(
				sections.filter((s) => !TOPICS.acceptance.test(s.heading)).flatMap((s) => listItems(s.body))
			).slice(0, 8);
		}

		const checkboxes = [...content.matchAll(/^\s*[-*]\s+\[[ xX]\]\s+(.*)$/gm)].map((m) =>
			plain(m[1])
		);
		const acceptance = unique([
			...itemsAbout(sections, TOPICS.acceptance, 10),
			...checkboxes
		]).slice(0, 10);

		const risks = itemsAbout(sections, TOPICS.risks, 6);

		const inlineQuestions = allProse
			.flatMap((p) => p.match(/[^.!?]*\?/g) ?? [])
			.map((q) => q.trim());
		const todos = [...content.matchAll(/\b(?:TODO|TBD)\b[:\s-]*(.+)$/gm)].map((m) => plain(m[1]));
		const listed = unique([...itemsAbout(sections, TOPICS.questions, 6), ...inlineQuestions]);
		const extraTodos = todos.filter(
			(todo) => !listed.some((q) => q.toLowerCase().includes(todo.toLowerCase()))
		);
		const openQuestions = unique([...listed, ...extraTodos]).slice(0, 6);

		const score = whatChanges.length + acceptance.length / 2 + words / 400 + codeBlocks;

		return {
			summary,
			whyItMatters,
			whatChanges,
			acceptance,
			risks,
			openQuestions,
			glossary: findTerms(content),
			effort: estimateEffort(score),
			readingMinutes: Math.max(1, Math.ceil(words / 200))
		};
	}
}
