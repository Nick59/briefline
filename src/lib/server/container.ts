import type { ServerConfig } from './config.ts';
import type { Db } from './db/connection.ts';
import type { Repositories, ServiceDeps } from './core/deps.ts';
import { EventBus } from './core/events.ts';
import { ActivityRepository } from './modules/activity/repository.ts';
import { ActivityService } from './modules/activity/service.ts';
import { ClaudeTranslator } from './modules/briefs/claude-translator.ts';
import { BriefService } from './modules/briefs/service.ts';
import { EpicRepository } from './modules/epics/repository.ts';
import { EpicService } from './modules/epics/service.ts';
import { PhaseRepository } from './modules/phases/repository.ts';
import { PhaseService } from './modules/phases/service.ts';
import { ProjectRepository } from './modules/projects/repository.ts';
import { ProjectService } from './modules/projects/service.ts';
import { SpecRepository } from './modules/specs/repository.ts';
import { SpecService } from './modules/specs/service.ts';
import { TaskRepository } from './modules/tasks/repository.ts';
import { TaskService } from './modules/tasks/service.ts';
import {
	createDefaultRegistry,
	type TicketProviderRegistry
} from './modules/ticketing/registry.ts';
import { SyncJobRepository } from './modules/ticketing/repository.ts';
import { TicketSyncService } from './modules/ticketing/service.ts';

export interface ContainerOptions {
	config: ServerConfig;
	env?: Record<string, string | undefined>;
	fetch?: typeof fetch;
	registry?: TicketProviderRegistry;
}

export function createContainer(
	db: Db,
	{
		config,
		env = process.env,
		fetch: fetchImpl = fetch,
		registry = createDefaultRegistry()
	}: ContainerOptions
) {
	const repos: Repositories = {
		projects: new ProjectRepository(db),
		epics: new EpicRepository(db),
		phases: new PhaseRepository(db),
		tasks: new TaskRepository(db),
		specs: new SpecRepository(db),
		activity: new ActivityRepository(db),
		syncJobs: new SyncJobRepository(db)
	};
	const deps: ServiceDeps = { db, repos, events: new EventBus() };

	const briefs = new BriefService(
		config.anthropicApiKey
			? new ClaudeTranslator(config.anthropicApiKey, config.anthropicModel)
			: null
	);
	const phases = new PhaseService(deps);
	const tasks = new TaskService(deps);
	const specs = new SpecService(deps, briefs);

	return {
		events: deps.events,
		projects: new ProjectService(deps),
		epics: new EpicService(deps, phases, tasks, specs),
		phases,
		tasks,
		specs,
		briefs,
		activity: new ActivityService(deps),
		ticketing: new TicketSyncService(deps, registry, {
			env,
			fetch: fetchImpl,
			publicUrl: env.PM_PUBLIC_URL ?? null
		})
	};
}

export type Container = ReturnType<typeof createContainer>;
