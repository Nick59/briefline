const QUOTE_OPEN = '“';
const QUOTE_CLOSE = '”';

/** Markdown reduced to one line of plain text. */
export function plainText(markdown: string): string {
	return markdown
		.replace(/```[^\n]*\n?/g, ' ')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
		.replace(/[`*_~]+/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Plain text cut on a word boundary to at most `max` characters, closed with an ellipsis. */
export function shorten(markdown: string, max: number): string {
	const text = plainText(markdown);
	if (text.length <= max) return text;
	const cut = text.slice(0, max);
	const space = cut.lastIndexOf(' ');
	const base = space > max / 2 ? cut.slice(0, space) : cut;
	return `${base.replace(/[\s.,;:!?-]+$/, '')}…`;
}

export const quoted = (markdown: string, max: number): string =>
	`${QUOTE_OPEN}${shorten(markdown, max)}${QUOTE_CLOSE}`;

export const QUESTION_MAX = 70;
export const QUESTION_MAX_IN_LIST = 40;
export const ANSWER_MAX = 40;

const VERBS: Record<string, string> = {
	'question.added': 'Asked',
	'question.answered': 'Answered',
	'question.ignored': 'Ignored',
	'question.reopened': 'Reopened',
	'question.replied': 'Replied in thread',
	'question.updated': 'Edited',
	'question.deleted': 'Deleted'
};

const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);

/**
 * The action and the question: `Asked “Which database…” on SHOP-E1`. Pass the epic key to
 * name where an added question lives. Null when the event carries no question text
 * (entries from before it was stored).
 */
export function questionPhrase(
	type: string,
	data: Record<string, unknown>,
	options: { key?: string | null; max?: number } = {}
): string | null {
	const verb = VERBS[type];
	const question = str(data.question);
	if (!verb || !question) return null;
	const { key, max = QUESTION_MAX } = options;
	const where = key ? ` on ${key}` : '';
	const count = typeof data.count === 'number' ? data.count : 1;
	if (type === 'question.added') {
		return count > 1
			? `Asked ${count} questions${where}: ${quoted(question, QUESTION_MAX_IN_LIST)} +${count - 1} more`
			: `Asked ${quoted(question, max)}${where}`;
	}
	const answer = str(data.answer);
	const tail = type === 'question.answered' && answer ? `: ${shorten(answer, ANSWER_MAX)}` : '';
	return `${verb} ${quoted(question, max)}${tail}`;
}
