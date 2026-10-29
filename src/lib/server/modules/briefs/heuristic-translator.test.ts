import { describe, expect, it } from 'vitest';
import { HeuristicTranslator } from './heuristic-translator.ts';

const SPEC = `# Search v2

Make search return results while the user types. Today results take two seconds.

## Goals
- Results in under 200 ms.

## Implementation
- Add an \`/search\` endpoint backed by a cache.
- Debounce input by 150 ms.

## Acceptance criteria
- [ ] Typing "sho" shows shoes.
- [x] p95 latency below 200 ms.

## Risks
- Cache can serve stale prices.

## Open questions
- Do we index archived products?

TODO: decide on ranking
`;

describe('HeuristicTranslator', () => {
	it('turns an AI spec into a plain brief', async () => {
		const brief = await new HeuristicTranslator().translate({ title: 'Search v2', content: SPEC });
		expect(brief.summary).toBe(
			'Make search return results while the user types. Today results take two seconds.'
		);
		expect(brief.whyItMatters).toBe('Results in under 200 ms.');
		expect(brief.whatChanges).toEqual([
			'Add an /search endpoint backed by a cache.',
			'Debounce input by 150 ms.'
		]);
		expect(brief.acceptance).toEqual(['Typing "sho" shows shoes.', 'p95 latency below 200 ms.']);
		expect(brief.risks).toEqual(['Cache can serve stale prices.']);
		expect(brief.openQuestions).toEqual(['Do we index archived products?', 'decide on ranking']);
		expect(brief.glossary.map((g) => g.term)).toEqual(
			expect.arrayContaining(['endpoint', 'cache', 'latency'])
		);
		expect(brief.effort).toBe('S');
	});

	it('does not count diagrams as implementation effort', async () => {
		const diagram = '```mermaid\nflowchart LR\n  a --> b\n```\n\n';
		const brief = await new HeuristicTranslator().translate({
			title: 'D',
			content: `Intro.\n\n${diagram.repeat(8)}`
		});
		expect(brief.effort).toBe('S');
	});

	it('copes with a spec without headings', async () => {
		const brief = await new HeuristicTranslator().translate({ title: 'Tiny', content: '' });
		expect(brief.summary).toBe('This document describes "Tiny".');
		expect(brief.readingMinutes).toBe(1);
	});
});
