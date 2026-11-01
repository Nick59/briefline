import type { ServerConfig } from './config.ts';
import type { Db } from './db/connection.ts';
import type { Repositories, ServiceDeps } from './core/deps.ts';
import { EventBus } from './core/events.ts';
import { ActivityRepository } from './modules/activity/repository.ts';
import { ActivityService } from './modules/activity/service.ts';
import { AttachmentRepository } from './modules/attachments/repository.ts';
import { AttachmentService } from './modules/attachments/service.ts';
import { ClaudeTranslator } from './modules/briefs/claude-translator.ts';
import { BriefService } from './modules/briefs/service.ts';
import { CommentRepository } from './modules/comments/repository.ts';
import { CommentService } from './modules/comments/service.ts';
import { EpicRepository } from './modules/epics/repository.ts';
import { EpicService } from './modules/epics/service.ts';
import { ProfileRepository } from './modules/profile/repository.ts';
import { PresenceRepository } from './modules/presence/repository.ts';
import { isPresenceIgnored, PresenceService } from './modules/presence/service.ts';
import { ANONYMOUS_ACTORS } from '#lib/shared/domain/actors.ts';
import { ProfileService } from './modules/profile/service.ts';
import { ProjectRepository } from './modules/projects/repository.ts';
import { ProjectService } from './modules/projects/service.ts';
import { TicketSearchService } from './modules/search/service.ts';
import { QuestionRepository } from './modules/questions/repository.ts';
import { QuestionService } from './modules/questions/service.ts';
import { SessionRepository } from './modules/sessions/repository.ts';
import { SessionService } from './modules/sessions/service.ts';
import { SpecRepository } from './modules/specs/repository.ts';
import { SpecService } from './modules/specs/service.ts';
import { TaskRepository } from './modules/tasks/repository.ts';
import { TaskService } from './modules/tasks/service.ts';
import {
	createDefaultRegistry,
	type TicketProviderRegistry
} from './modules/ticketing/registry.ts';
import { ConnectionRepository } from './modules/ticketing/connection-repository.ts';
import { TicketingConnectionService } from './modules/ticketing/connections.ts';
import { createSecretBox, SECRET_KEY_ENV } from './crypto/secrets.ts';
import { SyncJobRepository } from './modules/ticketing/repository.ts';
import { TicketSyncService } from './modules/ticketing/service.ts';

export interface ContainerOptions {
	config: ServerConfig;
	env?: Record<string, string | undefined>;
	fetch?: typeof fetch;
	registry?: TicketProviderRegistry;
	clock?: () => number;
}

export function createContainer(
	db: Db,
	{
		config,
		env = process.env,
		fetch: fetchImpl = fetch,
		registry = createDefaultRegistry(),
		clock = Date.now
	}: ContainerOptions
) {
	const repos: Repositories = {
		projects: new ProjectRepository(db),
		epics: new EpicRepository(db),
		tasks: new TaskRepository(db),
		comments: new CommentRepository(db),
		attachments: new AttachmentRepository(db),
		specs: new SpecRepository(db),
		questions: new QuestionRepository(db),
		activity: new ActivityRepository(db),
		sessions: new SessionRepository(db),
		profile: new ProfileRepository(db),
		syncJobs: new SyncJobRepository(db),
		connections: new ConnectionRepository(db)
	};
	const deps: ServiceDeps = { db, repos, events: new EventBus() };

	const briefs = new BriefService(
		config.anthropicApiKey
			? new ClaudeTranslator(config.anthropicApiKey, config.anthropicModel)
			: null
	);
	const attachments = new AttachmentService(deps, config.attachmentsDir);
	// Rows cascade with their owner; the files are removed afterwards.
	for (const type of ['task.deleted', 'spec.deleted', 'epic.deleted'] as const) {
		deps.events.subscribe((event) => event.type === type && attachments.sweepOrphans());
	}
	const activity = new ActivityService(deps);
	const tasks = new TaskService(deps);
	const specs = new SpecService(deps, briefs);
	const profile = new ProfileService(deps);
	const presence = new PresenceService(new PresenceRepository(db), {
		clock,
		isIgnored: isPresenceIgnored(() => profile.get()?.name ?? null, ANONYMOUS_ACTORS)
	});
	const connections = new TicketingConnectionService(
		deps,
		registry,
		createSecretBox(env[SECRET_KEY_ENV]),
		{ env, fetch: fetchImpl }
	);

	return {
		db,
		events: deps.events,
		attachments,
		projects: new ProjectService(deps, () => attachments.sweepOrphans()),
		epics: new EpicService(deps, tasks, specs),
		tasks,
		comments: new CommentService(deps),
		search: new TicketSearchService(deps),
		specs,
		questions: new QuestionService(deps),
		briefs,
		activity,
		sessions: new SessionService(deps, activity),
		profile,
		presence,
		connections,
		ticketing: new TicketSyncService(deps, registry, connections, {
			env,
			fetch: fetchImpl,
			publicUrl: env.PM_PUBLIC_URL ?? null
		})
	};
}

export type Container = ReturnType<typeof createContainer>;
