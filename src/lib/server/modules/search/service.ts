import type { ServiceDeps } from '../../core/deps.ts';

export type TicketKind = 'task' | 'epic' | 'project';

export interface TicketHit {
	kind: TicketKind;
	key: string;
	title: string;
	/** Key of the linked external ticket (Plane, Jira, GitHub ...), when there is one. */
	externalKey: string | null;
	projectKey: string;
	epicKey: string | null;
	epicTitle: string | null;
	path: string;
	/** True when the query is the entity's own key or its external key, not just a text match. */
	exact: boolean;
}

export const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

export class TicketSearchService {
	constructor(private readonly deps: ServiceDeps) {}

	find(rawQuery: string, limit = 8): TicketHit[] {
		const { repos } = this.deps;
		const query = rawQuery.trim();
		if (!query) return [];

		const hits = new Map<string, TicketHit>();
		const add = (hit: TicketHit) => {
			const id = `${hit.kind}:${hit.key}`;
			if (!hits.has(id)) hits.set(id, hit);
		};

		const project = repos.projects.find(query);
		if (project && project.key === query.toUpperCase()) add(this.#projectHit(project, true));

		const epic = repos.epics.find(query);
		if (epic && epic.key === query.toUpperCase()) add(this.#epicHit(epic, true));

		const task = repos.tasks.find(query);
		if (task && task.key === query.toUpperCase()) add(this.#taskHit(task, true));

		const externalKeys = externalCandidates(query);
		for (const e of repos.epics.findByExternalKey(externalKeys)) add(this.#epicHit(e, true));
		for (const t of repos.tasks.findByExternalKey(externalKeys)) add(this.#taskHit(t, true));

		for (const t of repos.tasks.searchByText(escapeLike(query), limit))
			add(this.#taskHit(t, false));
		return [...hits.values()].slice(0, limit);
	}

	#projectHit(project: { key: string; name: string }, exact: boolean): TicketHit {
		return {
			kind: 'project',
			key: project.key,
			title: project.name,
			externalKey: null,
			projectKey: project.key,
			epicKey: null,
			epicTitle: null,
			path: `/projects/${project.key}`,
			exact
		};
	}

	#epicHit(
		epic: { projectId: string; key: string; title: string; externalRef: { key: string } | null },
		exact: boolean
	): TicketHit {
		const project = this.deps.repos.projects.find(epic.projectId)!;
		return {
			kind: 'epic',
			key: epic.key,
			title: epic.title,
			externalKey: epic.externalRef?.key ?? null,
			projectKey: project.key,
			epicKey: epic.key,
			epicTitle: epic.title,
			path: `/projects/${project.key}/epics/${epic.key}`,
			exact
		};
	}

	#taskHit(
		task: { epicId: string; key: string; title: string; externalRef: { key: string } | null },
		exact: boolean
	): TicketHit {
		const epic = this.deps.repos.epics.find(task.epicId)!;
		const project = this.deps.repos.projects.find(epic.projectId)!;
		return {
			kind: 'task',
			key: task.key,
			title: task.title,
			externalKey: task.externalRef?.key ?? null,
			projectKey: project.key,
			epicKey: epic.key,
			epicTitle: epic.title,
			path: `/projects/${project.key}/epics/${epic.key}/tasks/${task.key}`,
			exact
		};
	}
}

/** `#123` and `123` both match a stored `#123`, since trackers differ in whether they keep the hash. */
function externalCandidates(query: string): string[] {
	const bare = query.replace(/^#/, '');
	return bare ? [...new Set([query, bare, `#${bare}`])] : [query];
}
