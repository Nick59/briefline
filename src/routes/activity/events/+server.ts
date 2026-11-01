import type { RequestHandler } from './$types';
import { liveEventStream } from '#lib/server/http/event-stream.ts';

export const GET: RequestHandler = ({ request }) => liveEventStream(request, null);
