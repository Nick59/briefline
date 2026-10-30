import type { Db } from '../db/connection.ts';
import type { ActivityRepository } from '../modules/activity/repository.ts';
import type { EpicRepository } from '../modules/epics/repository.ts';
import type { ProjectRepository } from '../modules/projects/repository.ts';
import type { SpecRepository } from '../modules/specs/repository.ts';
import type { TaskRepository } from '../modules/tasks/repository.ts';
import type { ConnectionRepository } from '../modules/ticketing/connection-repository.ts';
import type { SyncJobRepository } from '../modules/ticketing/repository.ts';
import type { EventBus } from './events.ts';

export interface Repositories {
	projects: ProjectRepository;
	epics: EpicRepository;
	tasks: TaskRepository;
	specs: SpecRepository;
	activity: ActivityRepository;
	syncJobs: SyncJobRepository;
	connections: ConnectionRepository;
}

export interface ServiceDeps {
	db: Db;
	repos: Repositories;
	events: EventBus;
}
