import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '#lib/shared/domain/types.ts';
import { applyMove, planMove } from './reorder.ts';

const list = ['a', 'b', 'c'].map((id) => ({ id }) as ProjectSummary);
const ids = (projects: ProjectSummary[]) => projects.map((p) => p.id);

describe('project reorder', () => {
	it('moves before another project or last', () => {
		expect(ids(applyMove(list, 'c', 'a'))).toEqual(['c', 'a', 'b']);
		expect(ids(applyMove(list, 'a', null))).toEqual(['b', 'c', 'a']);
	});

	it('plans nothing when the order stays the same', () => {
		expect(planMove(list, 'b', 'c')).toBeUndefined();
		expect(planMove(list, 'c', null)).toBeUndefined();
		expect(planMove(list, 'b', 'b')).toBeUndefined();
		expect(planMove(list, 'c', 'b')).toBe('b');
	});
});
