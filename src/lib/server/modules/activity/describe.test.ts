import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../core/events.ts';
import { describeEvent } from './describe.ts';

type Data = Extract<DomainEvent, { type: `question.${string}` }>['data'];
const event = (type: DomainEvent['type'], data: Partial<Data>): DomainEvent =>
	({
		type,
		projectId: 'p',
		epicId: 'e',
		taskId: null,
		actor: 'codex',
		data: { key: 'SHOP-E1', title: 'Which database?', ...data }
	}) as DomainEvent;

describe('describeEvent for questions', () => {
	const q = 'Which database should we use?';
	const cases: [DomainEvent['type'], Partial<Data>, string][] = [
		['question.added', { question: q }, `Asked “${q}” on SHOP-E1`],
		[
			'question.added',
			{ question: q, count: 3 },
			'Asked 3 questions on SHOP-E1: “Which database should we use?” +2 more'
		],
		['question.answered', { question: q, answer: 'Postgres' }, `Answered “${q}”: Postgres`],
		['question.replied', { question: q, body: 'Use RDS' }, `Replied in thread “${q}”`],
		['question.ignored', { question: q }, `Ignored “${q}”`],
		['question.reopened', { question: q }, `Reopened “${q}”`],
		['question.updated', { question: q }, `Edited “${q}”`],
		['question.deleted', { question: q }, `Deleted “${q}”`]
	];
	it.each(cases)('%s', (type, data, expected) => {
		expect(describeEvent(event(type, data))).toBe(expected);
	});

	it('shortens long markdown questions and answers', () => {
		const out = describeEvent(
			event('question.answered', {
				question: `**Which** database should we use for the checkout service when traffic grows quickly and unpredictably?`,
				answer: 'Postgres with read replicas in two regions and pooling'
			})
		);
		expect(out).toBe(
			'Answered “Which database should we use for the checkout service when traffic…”: Postgres with read replicas in two…'
		);
	});

	it('falls back to the title for entries without question text', () => {
		expect(describeEvent(event('question.added', {}))).toBe('Asked "Which database?" on SHOP-E1');
		expect(describeEvent(event('question.added', { count: 2 }))).toBe(
			'Asked 2 questions on SHOP-E1'
		);
		expect(describeEvent(event('question.answered', {}))).toBe(
			'Answered "Which database?" on SHOP-E1'
		);
		expect(describeEvent(event('question.replied', {}))).toBe(
			'Replied in thread "Which database?" on SHOP-E1'
		);
		expect(describeEvent(event('question.deleted', {}))).toBe(
			'Removed question "Which database?" on SHOP-E1'
		);
	});
});

describe('describeEvent for attachments', () => {
	const attachment = (
		type: 'attachment.added' | 'attachment.deleted',
		target: 'task' | 'spec' | 'project'
	) =>
		({
			type,
			projectId: 'p',
			epicId: null,
			taskId: null,
			actor: 'claude',
			data: {
				attachmentId: 'a',
				filename: 'screenshot.png',
				size: 1,
				mime: 'image/png',
				target: { type: target, id: 'x' },
				key: 'SHOP-12',
				title: 'Fix cart'
			}
		}) as DomainEvent;

	it('names the task, spec or project', () => {
		expect(describeEvent(attachment('attachment.added', 'task'))).toBe(
			'Added image “screenshot.png” to SHOP-12 “Fix cart”'
		);
		expect(describeEvent(attachment('attachment.added', 'spec'))).toBe(
			'Added image “screenshot.png” to spec “Fix cart”'
		);
		expect(describeEvent(attachment('attachment.added', 'project'))).toBe(
			'Added image “screenshot.png” to project'
		);
		expect(describeEvent(attachment('attachment.deleted', 'task'))).toBe(
			'Removed image “screenshot.png” from SHOP-12 “Fix cart”'
		);
	});
});
