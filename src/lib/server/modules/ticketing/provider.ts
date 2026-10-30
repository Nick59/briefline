import type { MappingKey, Stage, WorkStatus } from '#lib/shared/domain/constants.ts';
import type { ExternalRef, MappedState, TicketProviderInfo } from '#lib/shared/domain/types.ts';

export type { ProviderSetting, TicketProviderInfo } from '#lib/shared/domain/types.ts';

export interface TicketUpdate {
	status: WorkStatus;
	stage: Stage | null;
	mappingKey?: MappingKey;
	progress: number;
	title: string;
	comment: string | null;
	dashboardUrl: string | null;
}

/** Connection settings merged with the project's target fields. */
export interface ProviderContext {
	settings: Record<string, string>;
	/** Decrypted API key, or the provider's environment variable when none is stored. */
	secret: string | null;
	secretEnvVar: string | null;
	env: Record<string, string | undefined>;
	fetch: typeof fetch;
}

export interface TicketContext extends ProviderContext {
	ref: ExternalRef;
	/** The state the project mapped to this update, when it mapped one. */
	mapped: MappedState | null;
}

export interface ProviderState {
	id: string;
	name: string;
	group?: string;
}

export interface PushResult {
	/** Set when the push succeeded but not as configured, e.g. a mapped state no longer exists. */
	note?: string;
}

export interface TicketProvider extends Omit<TicketProviderInfo, 'supportsProjects'> {
	ticketUrl(ref: ExternalRef, settings: Record<string, string>): string | null;
	push(ctx: TicketContext, update: TicketUpdate): Promise<PushResult | void>;
	/** States an issue can be moved to. Group values: backlog, unstarted, started, completed. */
	listStates(ctx: ProviderContext): Promise<ProviderState[]>;
	/** Cheap authenticated request; throws TicketProviderError when the connection does not work. */
	testConnection(ctx: ProviderContext): Promise<void>;
	/** Projects of the external system, when the project target can be picked from a list. */
	listProjects?(ctx: ProviderContext): Promise<ProviderProject[]>;
}

export interface ProviderProject {
	id: string;
	name: string;
	identifier: string;
}

export class TicketProviderError extends Error {}

export function requireSecret(ctx: ProviderContext): string {
	if (ctx.secret) return ctx.secret;
	throw new TicketProviderError(
		ctx.secretEnvVar
			? `No API key saved for this connection and environment variable ${ctx.secretEnvVar} is not set`
			: 'No API key saved for this connection'
	);
}

export function requireSetting(ctx: ProviderContext, name: string): string {
	const value = ctx.settings[name]?.trim();
	if (!value) throw new TicketProviderError(`Missing provider setting '${name}'`);
	return value;
}

/** Resolves the mapped state against the live states; a stale mapping yields a fallback note. */
export function resolveMapped(
	ctx: TicketContext,
	states: ProviderState[]
): { state: ProviderState | null; note?: string } {
	if (!ctx.mapped) return { state: null };
	const state = states.find((s) => s.id === ctx.mapped!.id);
	if (state) return { state };
	return {
		state: null,
		note: `Mapped state '${ctx.mapped.name}' no longer exists in ${ctx.ref.provider}; used the default`
	};
}

export async function expectOk(response: Response, what: string) {
	if (response.ok) return;
	const body = await response.text().catch(() => '');
	throw new TicketProviderError(`${what} failed: HTTP ${response.status} ${body.slice(0, 300)}`);
}

export const TIMEOUT_MS = 10_000;

function redact(text: string, ctx: ProviderContext) {
	return ctx.secret ? text.split(ctx.secret).join('***') : text;
}

function safeUrl(url: string) {
	try {
		const parsed = new URL(url);
		parsed.username = '';
		parsed.password = '';
		return parsed.toString();
	} catch {
		return url;
	}
}

export interface FetchOptions {
	/** Reject a successful response that carries a body that is not JSON. Default true. */
	json?: boolean;
	/** Appended to the error message when the response is not JSON. */
	hint?: string;
}

/**
 * Sends a provider request, logs failures (and every request with BRIEFLINE_DEBUG_TICKETING=1),
 * and rejects a response whose body is not JSON, such as the HTML page of a web app.
 */
export async function providerFetch(
	ctx: ProviderContext,
	provider: string,
	url: string,
	init: RequestInit = {},
	options: FetchOptions = {}
): Promise<Response> {
	const method = init.method ?? 'GET';
	const shown = safeUrl(url);
	const started = Date.now();
	let response: Response;
	try {
		response = await ctx.fetch(url, init);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		console.warn(`[ticketing] ${provider} ${method} ${shown} -> network error ${reason}`);
		throw new TicketProviderError(`${provider} ${method} ${shown} failed: ${reason}`);
	}
	const contentType = response.headers.get('content-type') ?? '';
	const isJson = /json/i.test(contentType);
	const needsBody = !response.ok || (options.json !== false && !isJson);
	const text = needsBody
		? await response
				.clone()
				.text()
				.catch(() => '')
		: '';
	const wrongType = response.ok && options.json !== false && !isJson && text.trim() !== '';

	if (!response.ok || wrongType) {
		const snippet = redact(text.replace(/\s+/g, ' ').trim().slice(0, 300), ctx);
		console.warn(
			`[ticketing] ${provider} ${method} ${shown} -> ${response.status} ${contentType || '-'} ${snippet}`
		);
	} else if (ctx.env.BRIEFLINE_DEBUG_TICKETING === '1') {
		console.debug(
			`[ticketing] ${provider} ${method} ${shown} -> ${response.status} ${Date.now() - started}ms`
		);
	}
	if (wrongType) {
		throw new TicketProviderError(
			`${provider} returned ${response.status} ${contentType || 'no content-type'} for ${method} ${shown}.${options.hint ? ` ${options.hint}` : ''}`
		);
	}
	return response;
}
