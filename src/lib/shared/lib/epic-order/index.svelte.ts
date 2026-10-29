const CHANGE_EVENT = 'project-epic-order-changed';

/** Keeps the timeline and navigation in sync, including browser tabs and project switches. */
export function useEpicOrder(projectKey: () => string | null) {
	let ids = $state<string[]>([]);
	const key = () => `project-timeline-order:${projectKey()}`;

	$effect(() => {
		const storageKey = key();
		function read() {
			try {
				const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
				ids = Array.isArray(saved) && saved.every((id) => typeof id === 'string') ? saved : [];
			} catch {
				ids = [];
			}
		}
		function changed(event: Event) {
			const detail = (event as CustomEvent<{ key: string; ids: string[] }>).detail;
			if (detail.key === storageKey) ids = detail.ids;
		}
		function stored(event: StorageEvent) {
			if (event.key === storageKey || event.key === null) read();
		}
		read();
		window.addEventListener(CHANGE_EVENT, changed);
		window.addEventListener('storage', stored);
		return () => {
			window.removeEventListener(CHANGE_EVENT, changed);
			window.removeEventListener('storage', stored);
		};
	});

	return {
		sort<T extends { id: string }>(newestFirst: T[]): T[] {
			const base = newestFirst.toReversed();
			const ranks = new Map(ids.map((id, index) => [id, index]));
			const defaults = new Map(base.map((item, index) => [item.id, ids.length + index]));
			return base.sort(
				(a, b) =>
					(ranks.get(a.id) ?? defaults.get(a.id)!) - (ranks.get(b.id) ?? defaults.get(b.id)!)
			);
		},
		save(next: string[]) {
			ids = next;
			try {
				localStorage.setItem(key(), JSON.stringify(next));
			} catch {
				/* Keep both views synchronized when storage is unavailable. */
			}
			window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key: key(), ids: next } }));
		}
	};
}
