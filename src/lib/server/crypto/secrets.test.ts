import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSecretBox, SecretError } from './secrets.ts';

const key = () => randomBytes(32).toString('base64');

describe('secret box', () => {
	it('round-trips a secret', () => {
		const box = createSecretBox(key());
		const stored = box.encrypt('plane_api_abc');
		expect(stored).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
		expect(stored).not.toContain('plane_api_abc');
		expect(box.decrypt(stored)).toBe('plane_api_abc');
	});

	it('accepts a hex key and round-trips empty and unicode values', () => {
		const box = createSecretBox(randomBytes(32).toString('hex'));
		expect(box.decrypt(box.encrypt(''))).toBe('');
		expect(box.decrypt(box.encrypt('clé-🔑'))).toBe('clé-🔑');
	});

	it('uses a fresh iv for every encryption', () => {
		const box = createSecretBox(key());
		expect(box.encrypt('same')).not.toBe(box.encrypt('same'));
	});

	it('detects tampering with the ciphertext and the tag', () => {
		const box = createSecretBox(key());
		const [v, iv, tag, body] = box.encrypt('top secret').split(':');
		const flipped = Buffer.from(body, 'base64');
		flipped[0] ^= 1;
		expect(() => box.decrypt([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow(
			SecretError
		);
		const badTag = Buffer.from(tag, 'base64');
		badTag[0] ^= 1;
		expect(() => box.decrypt([v, iv, badTag.toString('base64'), body].join(':'))).toThrow(
			SecretError
		);
	});

	it('refuses to decrypt with another key', () => {
		const stored = createSecretBox(key()).encrypt('top secret');
		expect(() => createSecretBox(key()).decrypt(stored)).toThrow(/cannot be decrypted/);
	});

	it('rejects unknown formats', () => {
		expect(() => createSecretBox(key()).decrypt('v9:a:b:c')).toThrow(/unknown format/);
		expect(() => createSecretBox(key()).decrypt('plain')).toThrow(SecretError);
	});

	it('fails clearly without a key or with a malformed key', () => {
		const missing = createSecretBox(undefined);
		expect(missing.available).toBe(false);
		expect(() => missing.encrypt('x')).toThrow(/BRIEFLINE_SECRET_KEY is not set/);
		expect(() => createSecretBox('short').encrypt('x')).toThrow(/32 bytes/);
	});
});
