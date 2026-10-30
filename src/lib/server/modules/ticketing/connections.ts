import {
	createTicketingConnectionSchema,
	setProjectTicketingSchema,
	updateTicketingConnectionSchema,
	type CreateTicketingConnectionInput,
	type SetProjectTicketingInput,
	type UpdateTicketingConnectionInput
} from '#lib/shared/domain/schemas.ts';
import type {
	Project,
	ProviderSetting,
	SecretSource,
	TicketingConnection,
	TicketingProject,
	TicketingState
} from '#lib/shared/domain/types.ts';
import { SecretError, type SecretBox } from '../../crypto/secrets.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { ConflictError, DomainError, InvalidInputError, NotFoundError } from '../../core/errors.ts';
import { newId, now } from '../../core/ids.ts';
import { requireProject } from '../../core/lookup.ts';
import type { StoredConnection } from './connection-repository.ts';
import { validateHeaders, type HeaderEntry } from './headers.ts';
import { TicketProviderError, type ProviderContext, type TicketProvider } from './provider.ts';
import type { TicketProviderRegistry } from './registry.ts';

export interface ConnectionOptions {
	env: Record<string, string | undefined>;
	fetch: typeof fetch;
}

export interface ResolvedConnection {
	connection: StoredConnection;
	provider: TicketProvider;
	context: ProviderContext;
}

/** Surfaces failures from an external system as a 502 with the provider's message. */
function asProviderFailure(error: unknown): DomainError {
	if (error instanceof DomainError) return error;
	const message = error instanceof Error ? error.message : String(error);
	const known = error instanceof TicketProviderError || error instanceof SecretError;
	return new DomainError(
		known ? message : `Request to the ticketing system failed: ${message}`,
		502,
		'provider_error'
	);
}

function validateFields(
	provider: TicketProvider,
	scope: ProviderSetting['scope'],
	values: Record<string, string>
): Record<string, string> {
	const fields = provider.settings.filter((s) => s.scope === scope);
	const result: Record<string, string> = {};
	for (const [name, raw] of Object.entries(values)) {
		if (!fields.some((f) => f.name === name)) {
			const allowed = fields.map((f) => f.name).join(', ') || 'none';
			throw new InvalidInputError(
				`Unknown ${scope}-level field '${name}' for ${provider.label}. Allowed: ${allowed}`
			);
		}
		const value = raw.trim();
		if (value) result[name] = value;
	}
	for (const field of fields) {
		if (field.required && !result[field.name])
			throw new InvalidInputError(`${field.label} is required`);
	}
	return result;
}

export class TicketingConnectionService {
	constructor(
		private readonly deps: ServiceDeps,
		private readonly registry: TicketProviderRegistry,
		private readonly secrets: SecretBox,
		private readonly options: ConnectionOptions
	) {}

	/** False when BRIEFLINE_SECRET_KEY is missing, so API keys cannot be saved. */
	get secretsAvailable(): boolean {
		return this.secrets.available;
	}

	list(): TicketingConnection[] {
		const usage = this.deps.repos.connections.usage();
		return this.deps.repos.connections.list().map((c) => this.#toView(c, usage.get(c.id) ?? []));
	}

	get(id: string): TicketingConnection {
		const connection = this.#require(id);
		return this.#toView(connection, this.deps.repos.connections.usage().get(id) ?? []);
	}

	create(input: CreateTicketingConnectionInput): TicketingConnection {
		const data = createTicketingConnectionSchema.parse(input);
		const provider = this.#provider(data.provider);
		const timestamp = now();
		const connection: StoredConnection = {
			id: newId(),
			name: data.name,
			provider: provider.id,
			settings: validateFields(provider, 'connection', data.settings),
			secretCiphertext: data.secret ? this.#encrypt(data.secret) : null,
			headersCiphertext: this.#encryptHeaders(provider, data.headers ?? [], []),
			createdAt: timestamp,
			updatedAt: timestamp
		};
		this.deps.repos.connections.insert(connection);
		return this.get(connection.id);
	}

	update(id: string, input: UpdateTicketingConnectionInput): TicketingConnection {
		const data = updateTicketingConnectionSchema.parse(input);
		if (data.secret && data.clearSecret)
			throw new InvalidInputError('Send either a new secret or clearSecret, not both');
		const current = this.#require(id);
		const provider = this.#provider(current.provider);
		let secretCiphertext = current.secretCiphertext;
		if (data.clearSecret) secretCiphertext = null;
		else if (data.secret) secretCiphertext = this.#encrypt(data.secret);

		const headersCiphertext = data.headers
			? this.#encryptHeaders(provider, data.headers, this.#readHeaders(current))
			: current.headersCiphertext;

		this.deps.repos.connections.update({
			...current,
			name: data.name ?? current.name,
			settings: data.settings
				? validateFields(provider, 'connection', data.settings)
				: current.settings,
			secretCiphertext,
			headersCiphertext,
			updatedAt: now()
		});
		return this.get(id);
	}

	delete(id: string) {
		const connection = this.#require(id);
		const users = this.deps.repos.connections.usage().get(id) ?? [];
		if (users.length) {
			throw new ConflictError(
				`Connection '${connection.name}' is used by ${users.map((p) => `${p.name} (${p.key})`).join(', ')}. Disconnect ${users.length === 1 ? 'that project' : 'those projects'} first.`
			);
		}
		this.deps.repos.connections.delete(id);
	}

	async test(id: string): Promise<{ ok: boolean; message: string }> {
		try {
			const { provider, context } = this.resolve(this.#require(id), {});
			await provider.testConnection(context);
			return { ok: true, message: 'Connection works' };
		} catch (error) {
			return { ok: false, message: asProviderFailure(error).message };
		}
	}

	/** States of the project's connection. A connection or target not yet saved can be passed to preview it. */
	async listStates(
		projectIdOrKey: string,
		override: { connectionId?: string; target?: Record<string, string> } = {}
	): Promise<TicketingState[]> {
		const project = requireProject(this.deps.repos, projectIdOrKey);
		const connectionId = override.connectionId ?? project.ticketing.connectionId;
		if (!connectionId) throw new InvalidInputError('Select a ticketing connection first');
		try {
			const { provider, context } = this.resolve(
				this.#require(connectionId),
				override.target ?? project.ticketing.target
			);
			if (!provider.supportsStates) return [];
			return await provider.listStates(context);
		} catch (error) {
			throw asProviderFailure(error);
		}
	}

	/** Projects of the external system behind a connection, for picking the project target. */
	async listProjects(connectionId: string): Promise<TicketingProject[]> {
		try {
			const { provider, context } = this.resolve(this.#require(connectionId), {});
			if (!provider.listProjects) return [];
			return await provider.listProjects(context);
		} catch (error) {
			throw asProviderFailure(error);
		}
	}

	setProjectTicketing(
		projectIdOrKey: string,
		input: SetProjectTicketingInput,
		actor: string
	): Project {
		const data = setProjectTicketingSchema.parse(input);
		const { repos, events } = this.deps;
		const current = requireProject(repos, projectIdOrKey);
		const autoSync = data.autoSync ?? current.ticketing.autoSync;
		const postComments = data.postComments ?? current.ticketing.postComments;
		let next: Project['ticketing'];

		if (data.connectionId === null) {
			next = {
				connectionId: null,
				provider: null,
				target: {},
				statusMapping: {},
				autoSync,
				postComments
			};
		} else {
			const connection = this.#require(data.connectionId);
			const provider = this.#provider(connection.provider);
			const sameConnection = connection.id === current.ticketing.connectionId;
			const statusMapping =
				data.statusMapping ?? (sameConnection ? current.ticketing.statusMapping : {});
			if (!provider.supportsStates && Object.keys(statusMapping).length)
				throw new InvalidInputError(`${provider.label} has no states to map`);
			next = {
				connectionId: connection.id,
				provider: provider.id,
				target: validateFields(
					provider,
					'project',
					data.target ?? (sameConnection ? current.ticketing.target : {})
				),
				statusMapping,
				autoSync,
				postComments
			};
		}

		const project: Project = { ...current, ticketing: next, updatedAt: now() };
		repos.projects.update(project);
		events.emit({
			type: 'project.updated',
			projectId: project.id,
			epicId: null,
			taskId: null,
			actor,
			data: { name: project.name }
		});
		return project;
	}

	/** The provider and request context for a project, or null when it has no connection. */
	forProject(project: Project): ResolvedConnection | null {
		const id = project.ticketing.connectionId;
		const connection = id && this.deps.repos.connections.find(id);
		return connection ? this.resolve(connection, project.ticketing.target) : null;
	}

	resolve(connection: StoredConnection, target: Record<string, string>): ResolvedConnection {
		const provider = this.#provider(connection.provider);
		const { value: secret } = this.#secret(connection, provider);
		return {
			connection,
			provider,
			context: {
				settings: { ...connection.settings, ...target },
				secret,
				secretEnvVar: provider.secretEnvVar,
				headers: this.#storedHeaders(connection),
				env: this.options.env,
				fetch: this.options.fetch
			}
		};
	}

	#secret(
		connection: StoredConnection,
		provider: TicketProvider
	): { value: string | null; source: SecretSource } {
		if (connection.secretCiphertext && this.secrets.available) {
			try {
				return { value: this.secrets.decrypt(connection.secretCiphertext), source: 'stored' };
			} catch (error) {
				throw new TicketProviderError(error instanceof Error ? error.message : String(error));
			}
		}
		const fromEnv = provider.secretEnvVar ? this.options.env[provider.secretEnvVar] : undefined;
		return fromEnv ? { value: fromEnv, source: 'env' } : { value: null, source: 'none' };
	}

	#toView(
		connection: StoredConnection,
		usedBy: TicketingConnection['usedBy']
	): TicketingConnection {
		const provider = this.registry.get(connection.provider);
		const stored = Boolean(connection.secretCiphertext) && this.secrets.available;
		const env = provider?.secretEnvVar ? this.options.env[provider.secretEnvVar] : undefined;
		return {
			id: connection.id,
			name: connection.name,
			provider: connection.provider,
			settings: connection.settings,
			hasSecret: Boolean(connection.secretCiphertext),
			secretUnreadable: this.#unreadable(connection.secretCiphertext, (c) =>
				this.secrets.decrypt(c)
			),
			headersUnreadable: this.#readHeaders(connection) === null,
			secretSource: stored ? 'stored' : env ? 'env' : 'none',
			headers: (this.#readHeaders(connection) ?? []).map(({ name }) => ({ name, hasValue: true })),
			usedBy,
			createdAt: connection.createdAt,
			updatedAt: connection.updatedAt
		};
	}

	#storedHeaders(connection: StoredConnection): HeaderEntry[] {
		if (!connection.headersCiphertext) return [];
		try {
			return JSON.parse(this.secrets.decrypt(connection.headersCiphertext)) as HeaderEntry[];
		} catch (error) {
			throw new TicketProviderError(error instanceof Error ? error.message : String(error));
		}
	}

	/** True when a stored ciphertext is present but cannot be decrypted, for lack of a key or with a different one. */
	#unreadable(ciphertext: string | null, decrypt: (ciphertext: string) => string): boolean {
		if (!ciphertext) return false;
		if (!this.secrets.available) return true;
		try {
			decrypt(ciphertext);
			return false;
		} catch {
			return true;
		}
	}

	/** The stored headers, or null when they exist but cannot be read. */
	#readHeaders(connection: StoredConnection): HeaderEntry[] | null {
		if (!connection.headersCiphertext) return [];
		try {
			return this.#storedHeaders(connection);
		} catch {
			return null;
		}
	}

	/** An entry without a value keeps the stored value of the header with the same name; null means the stored list is unreadable. */
	#encryptHeaders(
		provider: TicketProvider,
		input: { name: string; value?: string }[],
		stored: HeaderEntry[] | null
	): string | null {
		const entries = validateHeaders(
			input.map(({ name, value }) => ({ name, value: value ?? '' })),
			provider.reservedHeaders
		).map((entry) => {
			if (entry.value) return entry;
			if (!stored)
				throw new InvalidInputError(`${entry.name} needs a value, the saved one can't be read`);
			const kept = stored.find((s) => s.name.toLowerCase() === entry.name.toLowerCase());
			if (!kept) throw new InvalidInputError(`Header '${entry.name}' needs a value`);
			return { name: entry.name, value: kept.value };
		});
		return entries.length ? this.#encrypt(JSON.stringify(entries)) : null;
	}

	#encrypt(secret: string): string {
		try {
			return this.secrets.encrypt(secret);
		} catch (error) {
			if (error instanceof SecretError) throw new InvalidInputError(error.message);
			throw error;
		}
	}

	#require(id: string): StoredConnection {
		const connection = this.deps.repos.connections.find(id);
		if (!connection) throw new NotFoundError('Ticketing connection', id);
		return connection;
	}

	#provider(id: string): TicketProvider {
		const provider = this.registry.get(id);
		if (!provider) throw new InvalidInputError(`Unknown ticket provider '${id}'`);
		return provider;
	}
}
