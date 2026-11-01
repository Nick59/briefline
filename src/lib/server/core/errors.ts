export class DomainError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code: string
	) {
		super(message);
	}
}

export class NotFoundError extends DomainError {
	constructor(entity: string, id: string) {
		super(`${entity} '${id}' was not found`, 404, 'not_found');
	}
}

export class ForbiddenError extends DomainError {
	constructor(message: string) {
		super(message, 403, 'forbidden');
	}
}

export class ConflictError extends DomainError {
	constructor(message: string) {
		super(message, 409, 'conflict');
	}
}

export class InvalidInputError extends DomainError {
	constructor(message: string) {
		super(message, 400, 'invalid_input');
	}
}

export class OpenQuestionsError extends DomainError {
	constructor(epicKey: string, open: number) {
		super(
			`Epic ${epicKey} has ${open} open ${open === 1 ? 'question' : 'questions'}. Answer or ignore them before starting a task (list_epic_questions).`,
			409,
			'open_questions'
		);
	}
}
