import { describe, expect, it } from 'vitest';
import { applyMove, planMove } from './reorder.ts';

const list = ['a', 'b', 'c'].map((id) => ({ id }));
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('reorder', () => {
	it('moves before another item or last', () => {
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
