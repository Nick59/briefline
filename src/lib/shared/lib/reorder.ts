/** Mirrors the server so the lists update before the request finishes. */
export function applyMove<T extends { id: string }>(
	items: T[],
	movingId: string,
	beforeId: string | null
): T[] {
	const moving = items.find((item) => item.id === movingId);
	if (!moving || beforeId === movingId) return items;
	const rest = items.filter((item) => item.id !== movingId);
	const index = beforeId ? rest.findIndex((item) => item.id === beforeId) : -1;
	rest.splice(index === -1 ? rest.length : index, 0, moving);
	return rest;
}

/** Returns undefined when the drop leaves the order unchanged. */
export function planMove<T extends { id: string }>(
	items: T[],
	movingId: string,
	beforeId: string | null
): string | null | undefined {
	const next = applyMove(items, movingId, beforeId);
	return next.every((item, i) => item.id === items[i].id) ? undefined : beforeId;
}
