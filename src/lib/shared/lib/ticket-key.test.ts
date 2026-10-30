import { describe, expect, it } from 'vitest';
import { splitOnKey, withTicketKey } from './ticket-key.ts';

describe('withTicketKey', () => {
	it('replaces the internal key as a whole word', () => {
		expect(withTicketKey('Moved SHOP-15 to Tests', 'SHOP-15', 'SOFT1-693')).toBe(
			'Moved SOFT1-693 to Tests'
		);
		expect(withTicketKey('Updated title of SHOP-15.', 'SHOP-15', 'SOFT1-693')).toBe(
			'Updated title of SOFT1-693.'
		);
	});

	it('leaves longer keys that contain it alone', () => {
		expect(withTicketKey('SHOP-150 and SHOP-15 and XSHOP-15', 'SHOP-15', 'A-1')).toBe(
			'SHOP-150 and A-1 and XSHOP-15'
		);
	});

	it('does not touch a task key when the epic key is replaced', () => {
		expect(withTicketKey('Updated epic SHOP-E1, task SHOP-E1-2', 'SHOP-E1', 'P-9')).toBe(
			'Updated epic P-9, task SHOP-E1-2'
		);
	});

	it('is a no-op without an external key', () => {
		expect(withTicketKey('Moved SHOP-15', 'SHOP-15', null)).toBe('Moved SHOP-15');
		expect(withTicketKey('Moved SHOP-15', undefined, 'A-1')).toBe('Moved SHOP-15');
	});

	it('keeps replacement characters literal', () => {
		expect(withTicketKey('Moved SHOP-15', 'SHOP-15', '$&1')).toBe('Moved $&1');
	});
});

describe('splitOnKey', () => {
	it('isolates the key', () => {
		expect(splitOnKey('Moved A-1 to Tests', 'A-1')).toEqual([
			{ text: 'Moved ', isKey: false },
			{ text: 'A-1', isKey: true },
			{ text: ' to Tests', isKey: false }
		]);
	});

	it('returns the whole message when the key is absent', () => {
		expect(splitOnKey('Nothing', 'A-1')).toEqual([{ text: 'Nothing', isKey: false }]);
	});
});
