import type { Epic, Project, Task } from '#lib/shared/domain/types.ts';
import type { Repositories } from './deps.ts';
import { NotFoundError } from './errors.ts';

export function requireProject(repos: Repositories, idOrKey: string): Project {
	const project = repos.projects.find(idOrKey);
	if (!project) throw new NotFoundError('Project', idOrKey);
	return project;
}

export function requireEpic(repos: Repositories, idOrKey: string): Epic {
	const epic = repos.epics.find(idOrKey);
	if (!epic) throw new NotFoundError('Epic', idOrKey);
	return epic;
}

export function requireTask(repos: Repositories, idOrKey: string): Task {
	const task = repos.tasks.find(idOrKey);
	if (!task) throw new NotFoundError('Task', idOrKey);
	return task;
}
