import type { QuestionStatus } from '#lib/shared/domain/constants.ts';
import {
	addEpicQuestionsSchema,
	answerQuestionSchema,
	replyToQuestionSchema,
	updateQuestionSchema,
	type AddEpicQuestionsInput,
	type UpdateQuestionInput
} from '#lib/shared/domain/schemas.ts';
import type { Epic, EpicQuestion, QuestionMessage } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { NotFoundError } from '../../core/errors.ts';
import type { DomainEvent } from '../../core/events.ts';
import { newId, now } from '../../core/ids.ts';
import { requireEpic } from '../../core/lookup.ts';
import { transaction } from '../../db/connection.ts';

type QuestionEvent = Extract<DomainEvent, { type: `question.${string}` }>['type'];

const MAX_STORED = 500;

const summarize = (markdown: string) => {
	const line = markdown.trim().split('\n')[0];
	return line.length > 120 ? `${line.slice(0, 117)}...` : line;
};

export class QuestionService {
	constructor(private readonly deps: ServiceDeps) {}

	list(epicIdOrKey: string, status?: QuestionStatus): EpicQuestion[] {
		const epic = requireEpic(this.deps.repos, epicIdOrKey);
		return this.deps.repos.questions.listByEpic(epic.id, status);
	}

	get(id: string): EpicQuestion {
		const question = this.deps.repos.questions.find(id);
		if (!question) throw new NotFoundError('Question', id);
		return question;
	}

	add(epicIdOrKey: string, input: AddEpicQuestionsInput, actor: string): EpicQuestion[] {
		const data = addEpicQuestionsSchema.parse(input);
		const { db, repos } = this.deps;
		const epic = requireEpic(repos, epicIdOrKey);
		const created = transaction(db, () => {
			let position = repos.questions.nextPosition(epic.id);
			return data.questions.map((item): EpicQuestion => {
				const question: EpicQuestion = {
					id: newId(),
					epicId: epic.id,
					position: position++,
					question: item.question,
					context: item.context || null,
					options: item.options ?? [],
					status: 'open',
					answer: null,
					askedBy: actor,
					answeredBy: null,
					createdAt: now(),
					answeredAt: null,
					messages: []
				};
				repos.questions.insert(question);
				return question;
			});
		});
		this.#emit('question.added', epic, created[0], actor, created);
		return created;
	}

	update(id: string, input: UpdateQuestionInput, actor: string): EpicQuestion {
		const data = updateQuestionSchema.parse(input);
		const current = this.get(id);
		const question: EpicQuestion = {
			...current,
			question: data.question ?? current.question,
			context: data.context === undefined ? current.context : data.context || null,
			options: data.options ?? current.options
		};
		this.deps.repos.questions.update(question);
		this.#emit('question.updated', this.#epic(question), question, actor);
		return question;
	}

	/** Adds to the thread without touching its status, so a resolved thread can still gain knowledge. */
	reply(id: string, input: { body: string }, actor: string): QuestionMessage {
		const { body } = replyToQuestionSchema.parse(input);
		const question = this.get(id);
		const message: QuestionMessage = {
			id: newId(),
			questionId: question.id,
			author: actor,
			body,
			createdAt: now()
		};
		this.deps.repos.questions.insertMessage(message);
		this.#emit('question.replied', this.#epic(question), question, actor, undefined, body);
		return message;
	}

	answer(id: string, input: { answer: string }, actor: string): EpicQuestion {
		const { answer } = answerQuestionSchema.parse(input);
		return this.#resolve(id, 'answered', answer, 'question.answered', actor);
	}

	ignore(id: string, actor: string): EpicQuestion {
		return this.#resolve(id, 'ignored', null, 'question.ignored', actor);
	}

	reopen(id: string, actor: string): EpicQuestion {
		const current = this.get(id);
		const question: EpicQuestion = {
			...current,
			status: 'open',
			answer: null,
			answeredBy: null,
			answeredAt: null
		};
		this.deps.repos.questions.update(question);
		this.#emit('question.reopened', this.#epic(question), question, actor);
		return question;
	}

	delete(id: string, actor: string) {
		const question = this.get(id);
		this.deps.repos.questions.delete(id);
		this.#emit('question.deleted', this.#epic(question), question, actor);
	}

	#resolve(
		id: string,
		status: 'answered' | 'ignored',
		answer: string | null,
		event: QuestionEvent,
		actor: string
	): EpicQuestion {
		const question: EpicQuestion = {
			...this.get(id),
			status,
			answer,
			answeredBy: actor,
			answeredAt: now()
		};
		this.deps.repos.questions.update(question);
		this.#emit(event, this.#epic(question), question, actor);
		return question;
	}

	#epic(question: EpicQuestion): Epic {
		return requireEpic(this.deps.repos, question.epicId);
	}

	#emit(
		type: QuestionEvent,
		epic: Epic,
		question: EpicQuestion,
		actor: string,
		added?: EpicQuestion[],
		body?: string
	) {
		this.deps.events.emit({
			type,
			projectId: epic.projectId,
			epicId: epic.id,
			taskId: null,
			actor,
			data: {
				key: epic.key,
				title: summarize(question.question),
				count: added?.length,
				questionId: question.id,
				questionIds: added?.map((q) => q.id),
				question: question.question.slice(0, MAX_STORED),
				answer: type === 'question.answered' ? question.answer?.slice(0, MAX_STORED) : undefined,
				body: body?.slice(0, MAX_STORED)
			}
		});
	}
}
