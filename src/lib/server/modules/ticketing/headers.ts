import { InvalidInputError } from '../../core/errors.ts';

export interface HeaderEntry {
	name: string;
	value: string;
}

export const MAX_HEADERS = 20;
export const MAX_HEADER_VALUE = 4096;

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const ALWAYS_RESERVED = [
	'host',
	'content-length',
	'content-type',
	'connection',
	'transfer-encoding',
	'cookie'
];

/**
 * Checks a custom header list and returns it with trimmed names. Values may be empty here:
 * callers fill them in from the stored list before validating a final one.
 */
export function validateHeaders(
	headers: HeaderEntry[],
	providerReserved: string[] = []
): HeaderEntry[] {
	if (headers.length > MAX_HEADERS)
		throw new InvalidInputError(`At most ${MAX_HEADERS} custom headers are allowed`);
	const reserved = new Set([...ALWAYS_RESERVED, ...providerReserved.map((n) => n.toLowerCase())]);
	const seen = new Set<string>();
	return headers.map(({ name: raw, value }) => {
		const name = raw.trim();
		if (!TOKEN.test(name)) throw new InvalidInputError(`'${name}' is not a valid HTTP header name`);
		const key = name.toLowerCase();
		if (reserved.has(key))
			throw new InvalidInputError(`Header '${name}' is set by Briefline and cannot be overridden`);
		if (seen.has(key)) throw new InvalidInputError(`Header '${name}' is listed more than once`);
		seen.add(key);
		if (value.length > MAX_HEADER_VALUE)
			throw new InvalidInputError(
				`The value of header '${name}' is longer than ${MAX_HEADER_VALUE} characters`
			);
		if (/[\r\n]/.test(value))
			throw new InvalidInputError(`The value of header '${name}' must not contain line breaks`);
		return { name, value };
	});
}

/** Custom headers first, then the request's own, which replace a custom header of the same name. */
export function mergeHeaders(
	custom: HeaderEntry[],
	own: HeadersInit | undefined
): Record<string, string> {
	const merged = new Headers();
	for (const { name, value } of custom) merged.set(name, value);
	new Headers(own).forEach((value, name) => merged.set(name, value));
	return Object.fromEntries(merged);
}
