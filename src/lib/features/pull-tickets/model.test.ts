import { describe, expect, it } from 'vitest';
import { pullLabel } from './model.ts';

const base = { running: false, lastPulledAt: null, updated: 0, error: null };
const now = Date.parse('2026-11-04T12:00:00Z');

describe('pullLabel', () => {
	it('shows that nothing was pulled yet', () => {
		expect(pullLabel(base, now).text).toBe('Not pulled yet');
	});

	it('shows the age and the number of updates', () => {
		const at = '2026-11-04T11:57:00Z';
		expect(pullLabel({ ...base, lastPulledAt: at, updated: 3 }, now).text).toBe(
			'Pulled 3 min ago · 3 updated'
		);
		expect(pullLabel({ ...base, lastPulledAt: '2026-11-04T11:59:00Z' }, now).text).toBe(
			'Pulled 1 min ago · no changes'
		);
	});

	it('shortens a long error and keeps the full text in the title', () => {
		const error = 'x'.repeat(200);
		const label = pullLabel({ ...base, error }, now);
		expect(label.failed).toBe(true);
		expect(label.text.length).toBeLessThan(100);
		expect(label.title).toBe(`Pull failed: ${error}`);
	});
});
