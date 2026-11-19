import { describe, expect, it } from 'vitest';
import { presenceRows, presenceText } from './presence.ts';

const seen = '2026-01-01T00:00:00.000Z';
const at = (minutes: number) => Date.parse(seen) + minutes * 60_000;

describe('presenceRows', () => {
	it('moves from online to last seen to offline with the clock', () => {
		const agents = [{ actor: 'codex', lastSeenAt: seen, transport: 'mcp' as const }];
		expect(presenceRows(agents, at(4.9))[0]).toMatchObject({ status: 'online', text: 'Online' });
		expect(presenceRows(agents, at(7))[0]).toMatchObject({
			status: 'away',
			text: 'Last seen 7 min ago'
		});
		expect(presenceRows(agents, at(20))[0]).toMatchObject({ status: 'offline', text: 'Offline' });
	});
	it('keeps agents seen under 24 h ago and drops the others', () => {
		const agents = [{ actor: 'codex', lastSeenAt: seen, transport: 'mcp' as const }];
		expect(presenceRows(agents, at(24 * 60 - 1))).toHaveLength(1);
		expect(presenceRows(agents, at(24 * 60))).toHaveLength(0);
		expect(presenceRows(agents, at(3 * 24 * 60))).toHaveLength(0);
	});
	it('never says 0 minutes', () => {
		expect(presenceText('away', seen, at(5))).toBe('Last seen 5 min ago');
	});
});
