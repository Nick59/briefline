import type { Tokens } from 'marked';
import type { MarkdownExtension } from '../extension.ts';

const TYPES = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const;
const PATTERN = new RegExp(
	`^> ?\\[!(${TYPES.join('|')})\\][^\\n]*\\n((?:>[^\\n]*(?:\\n|$))*)`,
	'i'
);

interface CalloutToken extends Tokens.Generic {
	kind: string;
	tokens: Tokens.Generic[];
}

/** GitHub-style alerts: "> [!WARNING]" followed by quoted lines. */
export const callouts: MarkdownExtension = {
	name: 'callouts',
	marked: {
		extensions: [
			{
				name: 'callout',
				level: 'block',
				start: (src) => src.match(/^> ?\[!/m)?.index,
				tokenizer(src) {
					const match = PATTERN.exec(src);
					if (!match) return undefined;
					const body = match[2].replace(/^> ?/gm, '');
					return {
						type: 'callout',
						raw: match[0],
						kind: match[1].toLowerCase(),
						tokens: this.lexer.blockTokens(body, [])
					};
				},
				renderer(token) {
					const { kind, tokens } = token as CalloutToken;
					return `<div class="md-callout" data-kind="${kind}"><p class="md-callout-title">${kind}</p>${this.parser.parse(tokens)}</div>`;
				}
			}
		]
	}
};
