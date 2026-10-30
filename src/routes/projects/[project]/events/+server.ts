import type { RequestHandler } from './$types';
import { app } from '#lib/server/runtime.ts';
import { liveState } from '#lib/server/live.ts';
import { orHttpError } from '#lib/server/http/load.ts';
import { formatSse, toLiveEvent } from '#lib/server/modules/activity/live.ts';

const PING_MS = 25_000;

// Dashboard session auth is enforced by hooks.server.ts, like every other project route.
export const GET: RequestHandler = ({ params, request }) => {
	const services = app();
	const project = orHttpError(() => services.projects.get(params.project));
	const encoder = new TextEncoder();
	let cleanup = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (chunk: string) => {
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					cleanup();
				}
			};
			const unsubscribe = liveState().bus.subscribe((event) => {
				const live = toLiveEvent(event, project.id, (e) => app().activity.externalKeyOf(e));
				if (live) send(formatSse(live));
			});
			const ping = setInterval(() => send(': ping\n\n'), PING_MS);
			cleanup = () => {
				unsubscribe();
				clearInterval(ping);
				try {
					controller.close();
				} catch {
					/* Already closed by the client. */
				}
			};
			request.signal.addEventListener('abort', cleanup, { once: true });
			send(': connected\n\n');
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
