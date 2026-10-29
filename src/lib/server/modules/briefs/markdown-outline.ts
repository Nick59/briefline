export interface Section {
	heading: string;
	level: number;
	body: string;
}

/** Splits markdown into heading sections and drops fenced code blocks. */
export function outline(markdown: string): { sections: Section[]; codeBlocks: number } {
	let codeBlocks = 0;
	const prose = markdown.replace(/```([^\n]*)[\s\S]*?(```|$)/g, (_block, lang: string) => {
		// Diagrams explain the work; they do not add implementation effort.
		if (lang.trim() !== 'mermaid') codeBlocks += 1;
		return '';
	});

	const sections: Section[] = [{ heading: '', level: 0, body: '' }];
	for (const line of prose.split('\n')) {
		const match = line.match(/^(#{1,6})\s+(.*)$/);
		if (match) sections.push({ heading: plain(match[2]), level: match[1].length, body: '' });
		else sections[sections.length - 1].body += `${line}\n`;
	}
	return { sections, codeBlocks };
}

/** Removes inline markdown so the text reads as plain language. */
export function plain(text: string): string {
	return text
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/(\*\*|__)(.*?)\1/g, '$2')
		.replace(/(\*|_)(.*?)\1/g, '$2')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function listItems(body: string): string[] {
	return body
		.split('\n')
		.map((line) => line.match(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/)?.[1])
		.filter((item): item is string => Boolean(item?.trim()))
		.map(plain);
}

export function paragraphs(body: string): string[] {
	return body
		.split(/\n\s*\n/)
		.map((block) => block.trim())
		.filter((block) => block && !/^\s*(?:[-*+]|\d+[.)]|\||>)/.test(block))
		.map(plain)
		.filter(Boolean);
}

export function firstSentences(text: string, count: number): string {
	const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g);
	if (!sentences) return text;
	return sentences.slice(0, count).join('').trim();
}
