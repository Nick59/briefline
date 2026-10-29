import type { z } from 'zod';
import type { Container } from '../container.ts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface OperationContext {
	actor: string;
}

export interface Operation<S extends z.ZodObject = z.ZodObject> {
	/** snake_case name, used as the MCP tool name and the OpenAPI operationId. */
	name: string;
	method: HttpMethod;
	/** Path under /api/v1 with {param} placeholders, e.g. /epics/{epic}. */
	path: string;
	tag: string;
	summary: string;
	description?: string;
	input: S;
	readOnly: boolean;
	successStatus?: number;
	run(app: Container, input: z.output<S>, ctx: OperationContext): unknown;
}

export function defineOperation<S extends z.ZodObject>(
	op: Omit<Operation<S>, 'readOnly'> & { readOnly?: boolean }
): Operation {
	return { readOnly: op.method === 'GET', ...op } as unknown as Operation;
}

export function pathParams(path: string): string[] {
	return [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}
