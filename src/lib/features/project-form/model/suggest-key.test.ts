import { describe, expect, it } from 'vitest';
import { suggestProjectKey } from './suggest-key.ts';

describe('suggestProjectKey', () => {
	it.each([
		['PULSE', 'PUL'],
		['Briefline', 'BRI'],
		['pulse', 'PUL'],
		['  PULSE  ', 'PUL'],
		['Project-Manager', 'PRO'],
		['Project Manager App', 'PMA'],
		['One Two Three Four Five', 'OTTF'],
		['A b', 'AB'],
		['Go', 'GO'],
		['A', 'AX'],
		['42 Answers', 'ANS'],
		['', '']
	])('%j gives %j', (name, key) => {
		expect(suggestProjectKey(name)).toBe(key);
	});

	it('always matches the server key pattern when not empty', () => {
		for (const name of ['9lives', '123', 'x', 'Hello World 2']) {
			const key = suggestProjectKey(name);
			if (key) expect(key).toMatch(/^[A-Z][A-Z0-9]{1,9}$/);
		}
	});
});
