/** Actors that actorFrom falls back to; they say nothing about who is calling. */
export const ANONYMOUS_ACTORS: ReadonlySet<string> = new Set(['api', 'mcp']);

export const HUMAN_ACTORS: readonly string[] = ['dashboard', 'seed'];

/** People are the dashboard and seed actors plus whoever's name is on the profile. */
export const isHumanActor = (actor: string, profileName?: string | null) =>
	HUMAN_ACTORS.includes(actor) || (profileName != null && actor === profileName);

export const ACTIVITY_WHO = ['all', 'people', 'agents'] as const;
export type ActivityWho = (typeof ACTIVITY_WHO)[number];
