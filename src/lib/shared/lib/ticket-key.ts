const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A key is a whole word: SHOP-15 must not match inside SHOP-150 or XSHOP-15.
const keyPattern = (key: string) => new RegExp(`(?<![\\w-])${escape(key)}(?![\\w-])`, 'g');

/** Swaps the internal key for the external ticket key in a message. */
export function withTicketKey(
	message: string,
	internalKey: string | null | undefined,
	externalKey: string | null | undefined
): string {
	if (!internalKey || !externalKey || internalKey === externalKey) return message;
	return message.replace(keyPattern(internalKey), () => externalKey);
}

export interface MessagePart {
	text: string;
	isKey: boolean;
}

/** Splits a message so the occurrences of the key can be rendered on their own. */
export function splitOnKey(message: string, key: string): MessagePart[] {
	const parts: MessagePart[] = [];
	let last = 0;
	for (const match of message.matchAll(keyPattern(key))) {
		if (match.index > last) parts.push({ text: message.slice(last, match.index), isKey: false });
		parts.push({ text: match[0], isKey: true });
		last = match.index + match[0].length;
	}
	if (last < message.length) parts.push({ text: message.slice(last), isKey: false });
	return parts;
}
