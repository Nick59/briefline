import { ZodError, z } from 'zod';
import type { Container } from '../container.ts';
import { DomainError } from '../core/errors.ts';
import { runWithTransport } from '../core/operation-context.ts';
import type { Operation, OperationContext } from './operation.ts';

export interface ApiErrorBody {
	error: { code: string; message: string; issues?: { path: string; message: string }[] };
}

export class ApiFailure extends Error {
	constructor(
		readonly status: number,
		readonly body: ApiErrorBody
	) {
		super(body.error.message);
	}
}

export async function execute(
	app: Container,
	op: Operation,
	rawInput: unknown,
	ctx: OperationContext
): Promise<unknown> {
	try {
		const input = op.input.parse(rawInput ?? {});
		const refusal = ctx.transport === 'mcp' ? op.mcp?.check?.(input) : null;
		if (refusal) throw new ApiFailure(400, { error: { code: 'invalid_input', message: refusal } });
		return await runWithTransport(ctx.transport, () => op.run(app, input, ctx));
	} catch (error) {
		throw toFailure(error);
	}
}

export function toFailure(error: unknown): ApiFailure {
	if (error instanceof ApiFailure) return error;
	if (error instanceof ZodError) {
		return new ApiFailure(400, {
			error: {
				code: 'invalid_input',
				message: z.prettifyError(error),
				issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
			}
		});
	}
	if (error instanceof DomainError) {
		return new ApiFailure(error.status, { error: { code: error.code, message: error.message } });
	}
	console.error('[api] unexpected error', error);
	return new ApiFailure(500, { error: { code: 'internal', message: 'Unexpected server error' } });
}

const ACTOR_PATTERN = /^[\w.@:/ -]{1,60}$/;

/** Agents identify themselves with the X-Actor header so the activity log shows who changed what. */
export function actorFrom(headers: Headers, fallback: string): string {
	const actor = headers.get('x-actor')?.trim();
	return actor && ACTOR_PATTERN.test(actor) ? actor : fallback;
}
