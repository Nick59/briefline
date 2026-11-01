import type { RequestHandler } from './$types';
import { app } from '#lib/server/runtime.ts';
import { orHttpError } from '#lib/server/http/load.ts';
import { liveEventStream } from '#lib/server/http/event-stream.ts';

// Dashboard session auth is enforced by hooks.server.ts, like every other project route.
export const GET: RequestHandler = ({ params, request }) => {
	const project = orHttpError(() => app().projects.get(params.project));
	return liveEventStream(request, project.id);
};
