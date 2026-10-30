import { describe, expect, it } from 'vitest';
import { isRecentlyChanged, liveStatus } from './status.ts';

describe('liveStatus', () => {
	it('is offline when the stream is closed', () => {
		expect(liveStatus('closed', 1000, 1001)).toBe('offline');
	});
	it('is idle without any agent event', () => {
		expect(liveStatus('open', null, 5000)).toBe('idle');
	});
	it('switches at 10 seconds and 5 minutes', () => {
		expect(liveStatus('open', 0, 9_999)).toBe('active');
		expect(liveStatus('open', 0, 10_000)).toBe('recent');
		expect(liveStatus('open', 0, 299_999)).toBe('recent');
		expect(liveStatus('open', 0, 300_000)).toBe('idle');
	});
});

describe('isRecentlyChanged', () => {
	it('holds for 2 seconds', () => {
		expect(isRecentlyChanged(0, 1_999)).toBe(true);
		expect(isRecentlyChanged(0, 2_000)).toBe(false);
		expect(isRecentlyChanged(undefined, 0)).toBe(false);
	});
});
