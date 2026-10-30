import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { invalidateAll } from '$app/navigation';
import type { LiveEvent } from '#lib/shared/domain/live.ts';
import { isRecentlyChanged, liveStatus, type Connection, type LiveStatus } from './status.ts';
import { isBriefOfPrevious } from './label.ts';
import { notifyAgentEvent } from './toasts.ts';

const RECENT_LIMIT = 5;
const REFRESH_DEBOUNCE_MS = 150;
const MUTE_KEY = 'live-activity-muted';

export class LiveActivity {
	connected = $state<Connection>('connecting');
	recent = $state<LiveEvent[]>([]);
	lastAgentAt = $state<number | null>(null);
	now = $state(Date.now());
	recentlyChanged = new SvelteMap<string, number>();
	muted = $state(readMuted());

	status = $derived<LiveStatus>(liveStatus(this.connected, this.lastAgentAt, this.now));

	#source: EventSource | null = null;
	#tick: ReturnType<typeof setInterval> | null = null;
	#refresh: ReturnType<typeof setTimeout> | null = null;
	#hadOpen = false;

	connect(projectKey: string) {
		this.disconnect();
		this.connected = 'connecting';
		const source = new EventSource(`/projects/${encodeURIComponent(projectKey)}/events`);
		this.#source = source;
		this.#hadOpen = false;
		source.onopen = () => {
			this.connected = 'open';
			this.#startTick();
			// EventSource auto-reconnects after an error, so events may have been missed.
			if (this.#hadOpen) this.#scheduleRefresh();
			this.#hadOpen = true;
		};
		source.onerror = () => {
			this.connected = source.readyState === EventSource.CLOSED ? 'closed' : 'connecting';
		};
		source.onmessage = (message) => {
			try {
				this.#handle(JSON.parse(message.data) as LiveEvent);
			} catch (error) {
				console.error('[live] unreadable event', error);
			}
		};
	}

	disconnect() {
		this.#source?.close();
		this.#source = null;
		if (this.#tick) clearInterval(this.#tick);
		if (this.#refresh) clearTimeout(this.#refresh);
		this.#tick = this.#refresh = null;
	}

	toggleMuted() {
		this.muted = !this.muted;
		try {
			localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
		} catch {
			/* The choice only lasts for this page load. */
		}
	}

	isChanged(key: string) {
		return isRecentlyChanged(this.recentlyChanged.get(key), this.now);
	}

	#handle(event: LiveEvent) {
		const at = Date.now();
		this.now = at;
		if (event.internalKey) this.recentlyChanged.set(event.internalKey, at);
		if (event.transport === 'mcp') {
			this.lastAgentAt = at;
			if (!isBriefOfPrevious(event, this.recent[0])) {
				this.recent = [event, ...this.recent].slice(0, RECENT_LIMIT);
			}
			if (!this.muted) notifyAgentEvent(event);
		}
		this.#scheduleRefresh();
	}

	#startTick() {
		if (this.#tick) return;
		this.#tick = setInterval(() => {
			this.now = Date.now();
			for (const [key, at] of this.recentlyChanged) {
				if (!isRecentlyChanged(at, this.now)) this.recentlyChanged.delete(key);
			}
		}, 1000);
	}

	#scheduleRefresh() {
		if (this.#refresh) clearTimeout(this.#refresh);
		this.#refresh = setTimeout(() => void invalidateAll(), REFRESH_DEBOUNCE_MS);
	}
}

function readMuted() {
	try {
		return localStorage.getItem(MUTE_KEY) === '1';
	} catch {
		return false;
	}
}

const CONTEXT_KEY = Symbol('live-activity');
export const provideLiveActivity = (store: LiveActivity) => setContext(CONTEXT_KEY, store);
export const useLiveActivity = () => getContext<LiveActivity>(CONTEXT_KEY);
