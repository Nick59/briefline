import { describe, expect, it } from 'vitest';
import { displayKey, displayKeyTitle } from './display-key.ts';

describe('displayKey', () => {
	it('uses the Briefline key without an external ticket', () => {
		expect(displayKey({ key: 'ABO-1', externalRef: null })).toBe('ABO-1');
		expect(displayKey({ key: 'ABO-1' })).toBe('ABO-1');
	});

	it('prefers the external ticket key', () => {
		expect(displayKey({ key: 'ABO-1', externalRef: { key: 'SOFT-1' } })).toBe('SOFT-1');
	});
});

describe('displayKeyTitle', () => {
	it('names the Briefline key only when an external key is shown', () => {
		expect(displayKeyTitle({ key: 'ABO-1', externalRef: { key: 'SOFT-1' } })).toBe(
			'Briefline key: ABO-1'
		);
		expect(displayKeyTitle({ key: 'ABO-1', externalRef: null })).toBeUndefined();
	});
});
