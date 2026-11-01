import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/connection.ts';
import { QuestionRepository } from './repository.ts';
import type { EpicQuestion, QuestionMessage } from '#lib/shared/domain/types.ts';

const question = (id: string, position: number): EpicQuestion => ({
	id,
	epicId: 'e1',
	position,
	question: id,
	context: null,
	options: [],
	status: 'open',
	answer: null,
	askedBy: 'claude',
	answeredBy: null,
	createdAt: 't',
	answeredAt: null,
	messages: []
});

const message = (id: string, questionId: string, createdAt: string): QuestionMessage => ({
	id,
	questionId,
	author: 'nick',
	body: id,
	createdAt
});

describe('QuestionRepository messages', () => {
	const setup = () => {
		const db = openDatabase(':memory:');
		db.exec(`
			INSERT INTO projects (id, key, name, created_at, updated_at) VALUES ('p1', 'PMA', 'PM', 't', 't');
			INSERT INTO epics (id, project_id, key, title, created_at, updated_at)
				VALUES ('e1', 'p1', 'PMA-E1', 'Epic', 't', 't');
		`);
		const repo = new QuestionRepository(db);
		repo.insert(question('q1', 0));
		repo.insert(question('q2', 1));
		return repo;
	};

	it('returns messages oldest first with each question, in list and find', () => {
		const repo = setup();
		repo.insertMessage(message('m2', 'q1', '2'));
		repo.insertMessage(message('m1', 'q1', '1'));
		repo.insertMessage(message('m3', 'q2', '3'));
		const [first, second] = repo.listByEpic('e1');
		expect(first.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
		expect(second.messages.map((m) => m.id)).toEqual(['m3']);
		expect(repo.find('q1')?.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
	});

	it('deletes messages with their question', () => {
		const repo = setup();
		repo.insertMessage(message('m1', 'q1', '1'));
		repo.delete('q1');
		expect(repo.find('q1')).toBeUndefined();
		expect(repo.listByEpic('e1').map((q) => q.id)).toEqual(['q2']);
		repo.insertMessage(message('m2', 'q2', '2'));
		expect(repo.find('q2')?.messages).toHaveLength(1);
	});
});
