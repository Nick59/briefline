import { describe, expect, it } from 'vitest';
import { plainText, questionPhrase, shorten } from './question-text.ts';

describe('shorten', () => {
	it('keeps short text', () => {
		expect(shorten('Which database?', 70)).toBe('Which database?');
	});

	it('cuts on a word boundary with an ellipsis', () => {
		const long =
			'Which database should we use for the checkout service when traffic grows quickly?';
		const out = shorten(long, 70);
		expect(out.endsWith('…')).toBe(true);
		expect(out.length).toBeLessThanOrEqual(71);
		expect(long.startsWith(out.slice(0, -1))).toBe(true);
		expect(long[out.length - 1]).toBe(' ');
	});

	it('cuts a single long word', () => {
		expect(shorten('x'.repeat(100), 10)).toBe(`${'x'.repeat(10)}…`);
	});

	it('strips markdown to one plain line', () => {
		expect(plainText('## Title\n\nWhich **bold** `code` [link](http://x.y)?\n- item')).toBe(
			'Title Which bold code link? item'
		);
	});
});

describe('questionPhrase', () => {
	const data = { question: 'Which database should we use?', key: 'SHOP-E1' };
	it('describes each action', () => {
		expect(questionPhrase('question.added', data, { key: 'SHOP-E1' })).toBe(
			'Asked “Which database should we use?” on SHOP-E1'
		);
		expect(questionPhrase('question.answered', { ...data, answer: 'Postgres' })).toBe(
			'Answered “Which database should we use?”: Postgres'
		);
		expect(questionPhrase('question.ignored', data)).toBe(
			'Ignored “Which database should we use?”'
		);
		expect(questionPhrase('question.reopened', data)).toBe(
			'Reopened “Which database should we use?”'
		);
		expect(questionPhrase('question.updated', data)).toBe('Edited “Which database should we use?”');
		expect(questionPhrase('question.deleted', data)).toBe(
			'Deleted “Which database should we use?”'
		);
	});

	it('summarises several added questions', () => {
		expect(
			questionPhrase(
				'question.added',
				{ question: 'Which database should we use for orders and invoices?', count: 3 },
				{ key: 'SHOP-E1' }
			)
		).toBe('Asked 3 questions on SHOP-E1: “Which database should we use for orders…” +2 more');
	});

	it('truncates the answer', () => {
		const out = questionPhrase('question.answered', {
			question: 'Q?',
			answer: 'Use the managed Postgres offering with read replicas in two regions'
		})!;
		expect(out).toMatch(/: Use the managed Postgres offering with…$/);
	});

	it('returns null without question text', () => {
		expect(questionPhrase('question.added', { title: 'x' })).toBeNull();
		expect(questionPhrase('task.created', data)).toBeNull();
	});
});
