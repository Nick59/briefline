import { computeProgress } from '#lib/shared/domain/progress.ts';
import {
	createProjectSchema,
	updateProjectSchema,
	type CreateProjectInput,
	type UpdateProjectInput
} from '#lib/shared/domain/schemas.ts';
import type { Project, ProjectSummary } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { ConflictError } from '../../core/errors.ts';
import { newId, now } from '../../core/ids.ts';
import { requireProject } from '../../core/lookup.ts';

export class ProjectService {
	constructor(private readonly deps: ServiceDeps) {}

	list(): ProjectSummary[] {
		const { repos } = this.deps;
		return repos.projects.list().map((project) => ({
			...project,
			epicCount: repos.epics.listByProject(project.id).length,
			progress: computeProgress(repos.tasks.listByProject(project.id))
		}));
	}

	get(idOrKey: string): Project {
		return requireProject(this.deps.repos, idOrKey);
	}

	create(input: CreateProjectInput, actor: string): Project {
		const data = createProjectSchema.parse(input);
		const { repos, events } = this.deps;
		if (repos.projects.keyExists(data.key))
			throw new ConflictError(`Project key '${data.key}' is already used`);
		const timestamp = now();
		const project: Project = {
			id: newId(),
			key: data.key,
			name: data.name,
			description: data.description,
			ticketing: {
				connectionId: null,
				provider: null,
				target: {},
				statusMapping: {},
				autoSync: true,
				postComments: true
			},
			createdAt: timestamp,
			updatedAt: timestamp
		};
		repos.projects.insert(project);
		events.emit({
			type: 'project.created',
			projectId: project.id,
			epicId: null,
			taskId: null,
			actor,
			data: { name: project.name }
		});
		return project;
	}

	update(idOrKey: string, input: UpdateProjectInput, actor: string): Project {
		const data = updateProjectSchema.parse(input);
		const current = this.get(idOrKey);
		const project: Project = {
			...current,
			name: data.name ?? current.name,
			description: data.description ?? current.description,
			updatedAt: now()
		};
		this.deps.repos.projects.update(project);
		this.deps.events.emit({
			type: 'project.updated',
			projectId: project.id,
			epicId: null,
			taskId: null,
			actor,
			data: { name: project.name }
		});
		return project;
	}

	delete(idOrKey: string) {
		this.deps.repos.projects.delete(this.get(idOrKey).id);
	}
}
