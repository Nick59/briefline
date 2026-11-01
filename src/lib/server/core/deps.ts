import type { Db } from '../db/connection.ts';
import type { ActivityRepository } from '../modules/activity/repository.ts';
import type { AttachmentRepository } from '../modules/attachments/repository.ts';
import type { CommentRepository } from '../modules/comments/repository.ts';
import type { EpicRepository } from '../modules/epics/repository.ts';
import type { ProfileRepository } from '../modules/profile/repository.ts';
import type { ProjectRepository } from '../modules/projects/repository.ts';
import type { QuestionRepository } from '../modules/questions/repository.ts';
import type { SessionRepository } from '../modules/sessions/repository.ts';
import type { SpecRepository } from '../modules/specs/repository.ts';
import type { TaskRepository } from '../modules/tasks/repository.ts';
import type { ConnectionRepository } from '../modules/ticketing/connection-repository.ts';
import type { SyncJobRepository } from '../modules/ticketing/repository.ts';
import type { EventBus } from './events.ts';

export interface Repositories {
	projects: ProjectRepository;
	epics: EpicRepository;
	tasks: TaskRepository;
	comments: CommentRepository;
	attachments: AttachmentRepository;
	specs: SpecRepository;
	questions: QuestionRepository;
	activity: ActivityRepository;
	sessions: SessionRepository;
	profile: ProfileRepository;
	syncJobs: SyncJobRepository;
	connections: ConnectionRepository;
}

export interface ServiceDeps {
	db: Db;
	repos: Repositories;
	events: EventBus;
}
