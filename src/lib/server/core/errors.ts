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
