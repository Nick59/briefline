import type { Activity, Page } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { newId, now } from '../../core/ids.ts';
import { requireEpic, requireProject, requireTask } from '../../core/lookup.ts';
import { describeEvent } from './describe.ts';

export interface Paging {
	limit?: number;
	offset?: number;
}

export class ActivityService {
	constructor(private readonly deps: ServiceDeps) {
		deps.events.subscribe((event) => {
			// The epic row is already gone when an epic is deleted, so the entry keeps no epic link.
			const epicId = event.type === 'epic.deleted' ? null : event.epicId;
			deps.repos.activity.insert({
				id: newId(),
				projectId: event.projectId,
				epicId,
				taskId: event.taskId,
				actor: event.actor,
				action: event.type,
				message: describeEvent(event),
				data: event.data as Record<string, unknown>,
				createdAt: now()
			});
		});
	}

	recent(paging?: Paging): Page<Activity> {
		return this.deps.repos.activity.list({ ...paging });
	}

	forProject(idOrKey: string, paging?: Paging): Page<Activity> {
		return this.deps.repos.activity.list({
			projectId: requireProject(this.deps.repos, idOrKey).id,
			...paging
		});
	}

	forEpic(idOrKey: string, paging?: Paging): Page<Activity> {
		return this.deps.repos.activity.list({
			epicId: requireEpic(this.deps.repos, idOrKey).id,
			...paging
		});
	}

	forTask(idOrKey: string, paging?: Paging): Page<Activity> {
		return this.deps.repos.activity.list({
			taskId: requireTask(this.deps.repos, idOrKey).id,
			...paging
		});
	}
}
