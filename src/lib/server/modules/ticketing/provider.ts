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

export interface TicketProvider extends TicketProviderInfo {
	ticketUrl(ref: ExternalRef, settings: Record<string, string>): string | null;
	push(ctx: TicketContext, update: TicketUpdate): Promise<PushResult | void>;
	/** States an issue can be moved to. Group values: backlog, unstarted, started, completed. */
	listStates(ctx: ProviderContext): Promise<ProviderState[]>;
	/** Cheap authenticated request; throws TicketProviderError when the connection does not work. */
	testConnection(ctx: ProviderContext): Promise<void>;
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
