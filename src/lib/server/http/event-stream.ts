import type { PresenceSnapshot } from '#lib/shared/domain/presence.ts';
import type { PullMessage } from '#lib/shared/domain/pull-status.ts';
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
			const onPull = (message: PullMessage) => {
				if (projectId === null || message.projectId === projectId)
					send(`event: pull\ndata: ${JSON.stringify(message)}\n\n`);
			};
			liveState().presence.add(onPresence);
			liveState().pulls.add(onPull);
			const ping = setInterval(() => send(': ping\n\n'), PING_MS);
			cleanup = () => {
				unsubscribe();
				liveState().presence.delete(onPresence);
				liveState().pulls.delete(onPull);
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
