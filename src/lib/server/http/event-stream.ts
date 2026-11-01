import type { PresenceSnapshot } from '#lib/shared/domain/presence.ts';
import { liveState } from '../live.ts';
import { app } from '../runtime.ts';
import { formatSse, toLiveEvent } from '../modules/activity/live.ts';

const PING_MS = 25_000;

/** A server-sent event stream of live events for one project, or for every project when `projectId` is null. */
export function liveEventStream(request: Request, projectId: string | null): Response {
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
				const live = toLiveEvent(event, projectId, (e) => app().activity.externalKeyOf(e));
				if (live) send(formatSse(live));
			});
			const onPresence = (snapshot: PresenceSnapshot) =>
				send(`event: presence\ndata: ${JSON.stringify(snapshot)}\n\n`);
			liveState().presence.add(onPresence);
			const ping = setInterval(() => send(': ping\n\n'), PING_MS);
			cleanup = () => {
				unsubscribe();
				liveState().presence.delete(onPresence);
				clearInterval(ping);
				try {
					controller.close();
				} catch {
					/* Already closed by the client. */
				}
			};
			request.signal.addEventListener('abort', cleanup, { once: true });
			send(': connected\n\n');
			onPresence(app().presence.snapshot());
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
}
