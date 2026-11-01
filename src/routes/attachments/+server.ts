import type { RequestHandler } from './$types';
import { uploadFromForm } from '#lib/server/http/attachments.ts';
import { app } from '#lib/server/runtime.ts';

export const POST: RequestHandler = ({ request }) => uploadFromForm(app(), request);
