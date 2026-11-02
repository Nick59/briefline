import type { z } from 'zod';
import type { Container } from '../container.ts';
import type { Transport } from '../core/events.ts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface OperationContext {
	actor: string;
	/** Set when the call arrives as an MCP tool call. */
	transport?: Transport;
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
	/** Rules that only apply to MCP tool calls; the REST API and dashboard are unaffected. */
	mcp?: {
		/** Hidden from tools/list unless the client connects with ?tools=all; still callable. */
		hidden?: boolean;
		/** Fields marked required in the tool's input schema. */
		required?: string[];
		/** Returns an error message when the call must be refused. */
		check?(input: z.output<S>): string | null;
	};
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
