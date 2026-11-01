import { describe, expect, it } from 'vitest';
import type { LiveEvent } from '#lib/shared/domain/live.ts';
import { isBriefOfPrevious, liveLabel } from './label.ts';

const live = (over: Partial<LiveEvent>): LiveEvent => ({
	type: 'spec.created',
	transport: 'mcp',
	actor: 'claude-code',
	taskId: 't1',
	epicId: 'e1',
	key: 'SHOP-10',
	internalKey: 'SHOP-10',
	title: 'Filters and URL state',
	data: {},
	message: 'Added spec "Filters and URL state"',
	at: '2026-01-01T00:00:00.000Z',
	...over
});

describe('liveLabel', () => {
	it('shows the key and a short verb, without the title', () => {
		expect(liveLabel(live({}))).toBe('SHOP-10 · Wrote spec');
	});

	it('shows the stage and status of a move with the external key', () => {
		const moved = live({
			type: 'task.stage_changed',
			key: 'SOFT1-693',
			data: { stage: 'dev', to: 'done' }
		});
		expect(liveLabel(moved)).toBe('SOFT1-693 · Dev: Done');
	});

	it('names question edits', () => {
		expect(liveLabel(live({ type: 'question.updated', key: 'SHOP-E1' }))).toBe(
			'SHOP-E1 · Edited question'
		);
	});

	it('names thread replies', () => {
		expect(liveLabel(live({ type: 'question.replied', key: 'SHOP-E1' }))).toBe(
			'SHOP-E1 · Replied in thread'
		);
	});

	it('names task comments', () => {
		expect(liveLabel(live({ type: 'task.commented', key: 'SHOP-12' }))).toBe('SHOP-12 · Commented');
	});

	it('shows the question in the label', () => {
		const data = { question: 'Which database should we use?', answer: 'Postgres' };
		expect(liveLabel(live({ type: 'question.added', key: 'SHOP-E1', data }))).toBe(
			'SHOP-E1 · Asked \u201cWhich database should we use?\u201d'
		);
		expect(liveLabel(live({ type: 'question.answered', key: 'SHOP-E1', data }))).toBe(
			'SHOP-E1 · Answered \u201cWhich database should we use?\u201d: Postgres'
		);
	});

	it('names ticket updates', () => {
		expect(liveLabel(live({ type: 'ticket.synced', key: 'SOFT1-693' }))).toBe(
			'SOFT1-693 · Updated ticket'
		);
	});

	it('drops the key when there is none', () => {
		expect(liveLabel(live({ type: 'project.updated', key: null }))).toBe('Updated project');
	});
});

describe('isBriefOfPrevious', () => {
	const brief = live({ type: 'spec.translated' });

	it('matches a brief sent with its spec', () => {
		expect(isBriefOfPrevious(brief, live({}))).toBe(true);
		expect(isBriefOfPrevious(brief, live({ type: 'spec.updated' }))).toBe(true);
	});

	it('keeps a brief written on its own', () => {
		expect(isBriefOfPrevious(brief, undefined)).toBe(false);
		expect(isBriefOfPrevious(brief, live({ title: 'Other spec' }))).toBe(false);
		expect(isBriefOfPrevious(brief, live({ type: 'task.stage_changed' }))).toBe(false);
	});
});

describe('liveLabel for attachments', () => {
	it('shows a short verb', () => {
		expect(liveLabel(live({ type: 'attachment.added' }))).toBe('SHOP-10 · Added image');
		expect(liveLabel(live({ type: 'attachment.deleted' }))).toBe('SHOP-10 · Removed image');
	});
});
