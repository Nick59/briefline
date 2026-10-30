import { describe, expect, it } from 'vitest';
import { mergeHeaders, validateHeaders } from './headers.ts';

const h = (name: string, value = 'v') => ({ name, value });

describe('validateHeaders', () => {
	it('accepts token names and trims them', () => {
		expect(validateHeaders([h(' CF-Access-Client-Id '), h("X_a!#$%&'*+.^`|~")])).toEqual([
			h('CF-Access-Client-Id'),
			h("X_a!#$%&'*+.^`|~")
		]);
	});

	it.each(['', 'bad name', 'a:b', 'é', 'a\nb'])('rejects the name %j', (name) => {
		expect(() => validateHeaders([h(name)])).toThrow(/not a valid HTTP header name/);
	});

	it('rejects more than 20 headers', () => {
		const many = Array.from({ length: 21 }, (_, i) => h(`X-${i}`));
		expect(() => validateHeaders(many)).toThrow(/At most 20/);
		expect(validateHeaders(many.slice(0, 20))).toHaveLength(20);
	});

	it('limits the value length and refuses line breaks', () => {
		expect(() => validateHeaders([h('X-A', 'a'.repeat(4097))])).toThrow(/longer than 4096/);
		expect(validateHeaders([h('X-A', 'a'.repeat(4096))])).toHaveLength(1);
		expect(() => validateHeaders([h('X-A', 'a\r\nX-B: b')])).toThrow(/line breaks/);
		expect(() => validateHeaders([h('X-A', 'a\nb')])).toThrow(/line breaks/);
	});

	it('rejects duplicates case-insensitively', () => {
		expect(() => validateHeaders([h('X-A'), h('x-a')])).toThrow(/more than once/);
	});

	it.each(['Host', 'content-LENGTH', 'Content-Type', 'Connection', 'Transfer-Encoding', 'COOKIE'])(
		'rejects the reserved name %s',
		(name) => {
			expect(() => validateHeaders([h(name)])).toThrow(/cannot be overridden/);
		}
	);

	it('rejects the provider authentication header', () => {
		expect(() => validateHeaders([h('X-API-Key')], ['x-api-key'])).toThrow(/cannot be overridden/);
		expect(validateHeaders([h('X-API-Key')])).toHaveLength(1);
	});
});

describe('mergeHeaders', () => {
	it('lets the request headers win over custom ones, ignoring case', () => {
		const merged = mergeHeaders([h('Authorization', 'custom'), h('CF-Access-Client-Id', 'id')], {
			authorization: 'Bearer real'
		});
		expect(merged).toEqual({
			authorization: 'Bearer real',
			'cf-access-client-id': 'id'
		});
	});
});
