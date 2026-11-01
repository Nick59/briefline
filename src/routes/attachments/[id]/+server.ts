import type { RequestHandler } from './$types';
import { serveAttachment } from '#lib/server/http/attachments.ts';
import { app } from '#lib/server/runtime.ts';

export const GET: RequestHandler = ({ params }) => serveAttachment(app(), params.id);
