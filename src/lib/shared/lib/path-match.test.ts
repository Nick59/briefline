import { describe, expect, it } from 'vitest';
import { pathIsWithin } from './path-match.ts';

describe('pathIsWithin', () => {
	const href = '/projects/ABO/epics/ABO-E1';

	it('matches the exact path', () => {
		expect(pathIsWithin(href, href)).toBe(true);
	});

	it('matches nested pages', () => {
		expect(pathIsWithin(`${href}/tasks/ABO-1`, href)).toBe(true);
	});

	it('does not match a sibling that shares the prefix', () => {
		expect(pathIsWithin('/projects/ABO/epics/ABO-E11', href)).toBe(false);
		expect(pathIsWithin('/projects/ABO/epics/ABO-E11/tasks/ABO-2', href)).toBe(false);
	});
});
