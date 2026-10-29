import type { RequestHandler } from './$types';
import { buildOpenApi } from '#lib/server/api/openapi.ts';

export const GET: RequestHandler = ({ url }) => Response.json(buildOpenApi(url.origin));
