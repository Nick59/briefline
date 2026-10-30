import { z } from 'zod';
import { operations } from './operations.ts';
import { pathParams } from './operation.ts';

type JsonSchema = Record<string, unknown> & {
	properties?: Record<string, JsonSchema>;
	required?: string[];
};

export function inputJsonSchema(schema: z.ZodType): JsonSchema {
	const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchema;
	delete json.$schema;
	return json;
}

function withoutKeys(schema: JsonSchema, keys: string[]): JsonSchema {
	const properties = Object.fromEntries(
		Object.entries(schema.properties ?? {}).filter(([k]) => !keys.includes(k))
	);
	const required = (schema.required ?? []).filter((k) => !keys.includes(k));
	return { ...schema, properties, ...(required.length ? { required } : { required: undefined }) };
}

export function buildOpenApi(origin: string) {
	const paths: Record<string, Record<string, unknown>> = {};
	for (const op of operations) {
		const schema = inputJsonSchema(op.input);
		const params = pathParams(op.path);
		const rest = withoutKeys(schema, params);
		const isQuery = op.method === 'GET' || op.method === 'DELETE';

		const parameters = [
			...params.map((name) => ({
				name,
				in: 'path',
				required: true,
				schema: schema.properties?.[name] ?? { type: 'string' }
			})),
			...(isQuery
				? Object.entries(rest.properties ?? {}).map(([name, s]) => ({
						name,
						in: 'query',
						required: rest.required?.includes(name) ?? false,
						schema: s
					}))
				: []),
			{
				name: 'X-Actor',
				in: 'header',
				required: false,
				schema: { type: 'string' },
				description: 'Who is making the change, e.g. claude-code'
			}
		];

		paths[`/api/v1${op.path}`] ??= {};
		paths[`/api/v1${op.path}`][op.method.toLowerCase()] = {
			operationId: op.name,
			tags: [op.tag],
			summary: op.summary,
			description: op.description,
			parameters,
			...(isQuery
				? {}
				: { requestBody: { required: true, content: { 'application/json': { schema: rest } } } }),
			responses: {
				[String(op.successStatus ?? 200)]: {
					description: 'Success',
					content: { 'application/json': {} }
				},
				'400': { $ref: '#/components/responses/Error' },
				'401': { $ref: '#/components/responses/Error' },
				'404': { $ref: '#/components/responses/Error' }
			}
		};
	}

	return {
		openapi: '3.1.0',
		info: {
			title: 'AI Project Manager API',
			version: '1.0.0',
			description:
				'Projects contain epics; epics contain tasks; tasks move through dev, test and deploy stages. The same operations are exposed as MCP tools at /mcp.'
		},
		servers: [{ url: origin }],
		security: [{ bearer: [] }],
		components: {
			securitySchemes: {
				bearer: {
					type: 'http',
					scheme: 'bearer',
					description: 'Required only when PM_API_TOKEN is set'
				}
			},
			responses: {
				Error: {
					description: 'Error',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									error: {
										type: 'object',
										properties: {
											code: { type: 'string' },
											message: { type: 'string' },
											issues: { type: 'array' }
										}
									}
								}
							}
						}
					}
				}
			}
		},
		paths
	};
}
