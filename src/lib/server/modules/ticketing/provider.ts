import type { Stage, WorkStatus } from '#lib/shared/domain/constants.ts';
import type { ExternalRef, TicketProviderInfo } from '#lib/shared/domain/types.ts';

export type { ProviderSetting, TicketProviderInfo } from '#lib/shared/domain/types.ts';

export interface TicketUpdate {
	status: WorkStatus;
	stage: Stage | null;
	progress: number;
	title: string;
	comment: string | null;
	dashboardUrl: string | null;
}

export interface TicketContext {
	ref: ExternalRef;
	settings: Record<string, string>;
	env: Record<string, string | undefined>;
	fetch: typeof fetch;
}

export interface TicketProvider extends TicketProviderInfo {
	ticketUrl(ref: ExternalRef, settings: Record<string, string>): string | null;
	push(ctx: TicketContext, update: TicketUpdate): Promise<void>;
}

export class TicketProviderError extends Error {}

export function requireEnv(ctx: TicketContext, name: string): string {
	const value = ctx.env[name];
	if (!value) throw new TicketProviderError(`Missing environment variable ${name}`);
	return value;
}

export function requireSetting(ctx: TicketContext, name: string): string {
	const value = ctx.settings[name]?.trim();
	if (!value) throw new TicketProviderError(`Missing provider setting '${name}'`);
	return value;
}

export async function expectOk(response: Response, what: string) {
	if (response.ok) return;
	const body = await response.text().catch(() => '');
	throw new TicketProviderError(`${what} failed: HTTP ${response.status} ${body.slice(0, 300)}`);
}

export const TIMEOUT_MS = 10_000;
