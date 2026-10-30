import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const SECRET_KEY_ENV = 'BRIEFLINE_SECRET_KEY';

export class SecretError extends Error {}

export interface SecretBox {
	/** False when no key is configured, so secrets cannot be stored or read. */
	readonly available: boolean;
	encrypt(plaintext: string): string;
	decrypt(stored: string): string;
}

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

function parseKey(raw: string): Buffer {
	const value = raw.trim();
	const key = /^[0-9a-f]{64}$/i.test(value)
		? Buffer.from(value, 'hex')
		: Buffer.from(value, 'base64');
	if (key.length !== KEY_BYTES) {
		throw new SecretError(
			`${SECRET_KEY_ENV} must be 32 bytes, base64 or hex encoded. Generate one with: openssl rand -base64 32`
		);
	}
	return key;
}

/**
 * AES-256-GCM. Stored format: `v1:<iv>:<tag>:<ciphertext>`, each part base64.
 * The version prefix leaves room to rotate the algorithm without breaking stored values.
 */
export function createSecretBox(rawKey: string | undefined): SecretBox {
	const configured = Boolean(rawKey?.trim());
	const key = () => {
		if (!configured) {
			throw new SecretError(
				`${SECRET_KEY_ENV} is not set. Generate one with: openssl rand -base64 32`
			);
		}
		return parseKey(rawKey!);
	};
	return {
		available: configured,
		encrypt(plaintext) {
			const iv = randomBytes(IV_BYTES);
			const cipher = createCipheriv('aes-256-gcm', key(), iv);
			const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
			return [VERSION, toB64(iv), toB64(cipher.getAuthTag()), toB64(body)].join(':');
		},
		decrypt(stored) {
			const [version, iv, tag, body] = stored.split(':');
			if (version !== VERSION || !iv || !tag || body === undefined) {
				throw new SecretError('Stored secret has an unknown format');
			}
			try {
				const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
				decipher.setAuthTag(Buffer.from(tag, 'base64'));
				return Buffer.concat([
					decipher.update(Buffer.from(body, 'base64')),
					decipher.final()
				]).toString('utf8');
			} catch (error) {
				if (error instanceof SecretError) throw error;
				throw new SecretError(
					`Stored secret cannot be decrypted. It was tampered with or ${SECRET_KEY_ENV} changed.`
				);
			}
		}
	};
}

const toB64 = (value: Buffer) => value.toString('base64');
