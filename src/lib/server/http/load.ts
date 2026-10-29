import { error } from '@sveltejs/kit';
import { DomainError } from '../core/errors.ts';

/** Runs a service call inside a load function and turns domain errors into HTTP errors. */
export function orHttpError<T>(fn: () => T): T {
	try {
		return fn();
	} catch (cause) {
		if (cause instanceof DomainError) error(cause.status, cause.message);
		throw cause;
	}
}
