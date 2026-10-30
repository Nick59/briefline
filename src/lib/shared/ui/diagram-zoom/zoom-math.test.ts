import { describe, expect, it } from 'vitest';
import {
	clampScale,
	fitView,
	panBy,
	wheelFactor,
	zoomAt,
	MAX_SCALE,
	MIN_SCALE
} from './zoom-math.ts';

describe('zoom math', () => {
	it('clamps the scale', () => {
		expect(clampScale(100)).toBe(MAX_SCALE);
		expect(clampScale(0.001)).toBe(MIN_SCALE);
		expect(clampScale(2)).toBe(2);
	});

	it('keeps the point under the cursor fixed', () => {
		const view = { x: 10, y: 20, scale: 1 };
		const point = { x: 200, y: 100 };
		const next = zoomAt(view, 2, point);
		const before = { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
		const after = { x: (point.x - next.x) / next.scale, y: (point.y - next.y) / next.scale };
		expect(next.scale).toBe(2);
		expect(after.x).toBeCloseTo(before.x);
		expect(after.y).toBeCloseTo(before.y);
	});

	it('does not move when already at the limit', () => {
		const view = { x: 5, y: 5, scale: MAX_SCALE };
		expect(zoomAt(view, 2, { x: 50, y: 50 })).toEqual(view);
	});

	it('fits and centers large content', () => {
		const view = fitView({ width: 1000, height: 500 }, { width: 548, height: 400 }, 24);
		expect(view.scale).toBeCloseTo(0.5);
		expect(view.x).toBeCloseTo(24);
		expect(view.y).toBeCloseTo((400 - 250) / 2);
	});

	it('does not enlarge small content past 100%', () => {
		expect(fitView({ width: 100, height: 100 }, { width: 800, height: 600 }).scale).toBe(1);
	});

	it('handles empty content', () => {
		expect(fitView({ width: 0, height: 0 }, { width: 800, height: 600 })).toEqual({
			x: 0,
			y: 0,
			scale: 1
		});
	});

	it('pans', () => {
		expect(panBy({ x: 1, y: 2, scale: 3 }, 4, 5)).toEqual({ x: 5, y: 7, scale: 3 });
	});

	it('zooms in on negative wheel delta, faster with ctrl', () => {
		expect(wheelFactor(-100, false)).toBeGreaterThan(1);
		expect(wheelFactor(100, false)).toBeLessThan(1);
		expect(wheelFactor(-10, true)).toBeGreaterThan(wheelFactor(-10, false));
	});
});
