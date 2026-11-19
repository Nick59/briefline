export function suggestProjectKey(name: string): string {
	const words = name
		.split(/\s+/)
		.map((w) => w.toUpperCase().replace(/[^A-Z0-9]/g, ''))
		.filter(Boolean);
	// The server key pattern requires a leading letter.
	if (words.length) words[0] = words[0].replace(/^[0-9]+/, '');
	const parts = words.filter(Boolean);
	if (!parts.length) return '';
	const key =
		parts.length === 1
			? parts[0].slice(0, 3)
			: parts
					.map((w) => w[0])
					.join('')
					.slice(0, 4);
	return key.padEnd(2, 'X');
}
