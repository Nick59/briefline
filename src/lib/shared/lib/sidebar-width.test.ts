import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStored, writeStored } from './local-storage.ts';
import {
	SIDEBAR_DEFAULT,
	SIDEBAR_MAX,
	SIDEBAR_MIN,
	clampSidebarWidth,
	parseSidebarWidth
} from './sidebar-width.ts';

describe('sidebar width', () => {
	it('clamps to the allowed range', () => {
		expect(clampSidebarWidth(100)).toBe(SIDEBAR_MIN);
		expect(clampSidebarWidth(900)).toBe(SIDEBAR_MAX);
		expect(clampSidebarWidth(300.4)).toBe(300);
	});

	it('falls back to the default for unusable values', () => {
		expect(clampSidebarWidth(NaN)).toBe(SIDEBAR_DEFAULT);
		expect(parseSidebarWidth(null)).toBe(SIDEBAR_DEFAULT);
		expect(parseSidebarWidth('')).toBe(SIDEBAR_DEFAULT);
		expect(parseSidebarWidth('abc')).toBe(SIDEBAR_DEFAULT);
	});

	it('clamps a stored width', () => {
		expect(parseSidebarWidth('320')).toBe(320);
		expect(parseSidebarWidth('9999')).toBe(SIDEBAR_MAX);
	});
});

describe('local storage helpers', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('returns null and ignores writes when storage throws', () => {
		const blocked = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		};
		vi.stubGlobal('localStorage', blocked);
		expect(readStored('k')).toBeNull();
		expect(() => writeStored('k', 'v')).not.toThrow();
	});

	it('round-trips a value', () => {
		const data = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, v)
		});
		writeStored('k', 'v');
		expect(readStored('k')).toBe('v');
	});
});
