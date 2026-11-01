import type { ProjectSummary } from '#lib/shared/domain/types.ts';

/** Mirrors the server so the lists update before the request finishes. */
export function applyMove(
	projects: ProjectSummary[],
	movingId: string,
	beforeId: string | null
): ProjectSummary[] {
	const moving = projects.find((p) => p.id === movingId);
	if (!moving || beforeId === movingId) return projects;
	const rest = projects.filter((p) => p.id !== movingId);
	const index = beforeId ? rest.findIndex((p) => p.id === beforeId) : -1;
	rest.splice(index === -1 ? rest.length : index, 0, moving);
	return rest;
}

/** Returns null when the drop leaves the order unchanged. */
export function planMove(
	projects: ProjectSummary[],
	movingId: string,
	beforeId: string | null
): string | null | undefined {
	const next = applyMove(projects, movingId, beforeId);
	return next.every((p, i) => p.id === projects[i].id) ? undefined : beforeId;
}
