import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { invalidateAll } from '$app/navigation';
import type { LiveEvent } from '#lib/shared/domain/live.ts';
import type { PullMessage, PullStatus } from '#lib/shared/domain/pull-status.ts';
import { isRecentlyChanged, liveStatus, type Connection, type LiveStatus } from './status.ts';
import type { AgentPresence, PresenceSnapshot } from '#lib/shared/domain/presence.ts';
import { PRESENCE_TICK_MS, presenceRows } from './presence.ts';
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
	agents = $state<AgentPresence[]>([]);
	/** Server time minus browser time, so the presence status does not depend on the browser clock. */
	clockOffset = $state(0);
	presenceNow = $state(Date.now());
	presence = $derived(presenceRows(this.agents, this.presenceNow + this.clockOffset));
	recentlyChanged = new SvelteMap<string, number>();
	/** Latest ticket pull status per project id, newer than the page data. */
	pulls = new SvelteMap<string, PullStatus>();
	muted = $state(readMuted());
	/** Pages that must not reload under the reader, such as a later page of a list, set this. */
	holdRefresh = false;
	#heldListeners = new Set<() => void>();

	status = $derived<LiveStatus>(liveStatus(this.connected, this.lastAgentAt, this.now));

	#source: EventSource | null = null;
	#tick: ReturnType<typeof setInterval> | null = null;
	#refresh: ReturnType<typeof setTimeout> | null = null;
	#presenceTick: ReturnType<typeof setInterval> | null = null;
	#hadOpen = false;

	/** Streams one project's events, or every project's when `projectKey` is null. */
	connect(projectKey: string | null) {
		this.disconnect();
		this.connected = 'connecting';
		const source = new EventSource(
			projectKey ? `/projects/${encodeURIComponent(projectKey)}/events` : '/activity/events'
		);
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
		source.addEventListener('presence', (message) => {
			try {
				this.setPresence(JSON.parse((message as MessageEvent<string>).data) as PresenceSnapshot);
			} catch (error) {
				console.error('[live] unreadable presence', error);
			}
		});
		source.addEventListener('pull', (message) => {
			try {
				const { projectId, status } = JSON.parse(
					(message as MessageEvent<string>).data
				) as PullMessage;
				this.setPull(projectId, status);
			} catch (error) {
				console.error('[live] unreadable pull status', error);
			}
		});
		source.onmessage = (message) => {
			try {
				this.#handle(JSON.parse(message.data) as LiveEvent);
			} catch (error) {
				console.error('[live] unreadable event', error);
			}
		};
	}

	setPull(projectId: string, status: PullStatus) {
		this.pulls.set(projectId, status);
	}

	setPresence(snapshot: PresenceSnapshot | null) {
		if (!snapshot) return;
		this.agents = snapshot.agents;
		this.clockOffset = Date.parse(snapshot.serverTime) - Date.now();
		this.presenceNow = Date.now();
	}

	/** Re-evaluates the presence status every 30 seconds, so agents age without new events. */
	startPresenceClock() {
		if (this.#presenceTick) return;
		this.#presenceTick = setInterval(() => (this.presenceNow = Date.now()), PRESENCE_TICK_MS);
	}

	stopPresenceClock() {
		if (this.#presenceTick) clearInterval(this.#presenceTick);
		this.#presenceTick = null;
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

	/** While a refresh is held, the listener runs instead, so a held list can update itself. */
	onHeldRefresh(listener: () => void) {
		this.#heldListeners.add(listener);
		return () => this.#heldListeners.delete(listener);
	}

	#scheduleRefresh() {
		if (this.#refresh) clearTimeout(this.#refresh);
		this.#refresh = setTimeout(() => {
			if (!this.holdRefresh) void invalidateAll();
			else for (const listener of this.#heldListeners) listener();
		}, REFRESH_DEBOUNCE_MS);
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
