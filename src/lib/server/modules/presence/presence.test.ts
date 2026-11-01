import { describe, expect, it } from 'vitest';
import { PRESENCE_OFFLINE_MS, PRESENCE_ONLINE_MS } from '#lib/shared/domain/constants.ts';
import { presenceStatus, type PresenceSnapshot } from '#lib/shared/domain/presence.ts';
import { readConfig } from '../../config.ts';
import { createContainer } from '../../container.ts';
import { openDatabase } from '../../db/connection.ts';
import { handleMcp } from '../../mcp/handler.ts';
import { execute } from '../../api/execute.ts';
import { operationsByName } from '../../api/operations.ts';

function setup(db = openDatabase(':memory:'), start = Date.parse('2026-01-01T00:00:00Z')) {
	const time = { now: start };
	const app = createContainer(db, { config: readConfig({}), env: {}, clock: () => time.now });
	const events: PresenceSnapshot[] = [];
	app.presence.subscribe((s) => events.push(s));
	return { app, db, time, events };
}

const rows = (db: ReturnType<typeof openDatabase>) =>
	db.prepare('SELECT actor, last_seen_at FROM agent_presence').all() as {
		actor: string;
		last_seen_at: string;
	}[];

describe('presence', () => {
	it('records agents and ignores people and anonymous callers', () => {
		const { app, db } = setup();
		app.profile.update({ name: 'Nick', role: 'developer', codingLevel: 'expert' } as never);
		expect(app.presence.touch('codex', 'mcp')).toBe(true);
		for (const actor of ['dashboard', 'seed', 'Nick', 'api', 'mcp']) {
			expect(app.presence.touch(actor, 'api')).toBe(false);
		}
		expect(app.presence.list().map((a) => a.actor)).toEqual(['codex']);
		expect(rows(db).map((r) => r.actor)).toEqual(['codex']);
	});

	it('computes the status at the 5 and 20 minute boundaries', () => {
		const t = 1_000_000;
		expect(presenceStatus(t, t + PRESENCE_ONLINE_MS - 1)).toBe('online');
		expect(presenceStatus(t, t + PRESENCE_ONLINE_MS)).toBe('away');
		expect(presenceStatus(t, t + PRESENCE_OFFLINE_MS - 1)).toBe('away');
		expect(presenceStatus(t, t + PRESENCE_OFFLINE_MS)).toBe('offline');
	});

	it('orders agents by most recent request', () => {
		const { app, time } = setup();
		app.presence.touch('a', 'mcp');
		time.now += 1000;
		app.presence.touch('b', 'api');
		time.now += 1000;
		app.presence.touch('a', 'mcp');
		expect(app.presence.list().map((x) => x.actor)).toEqual(['a', 'b']);
	});

	it('writes at most once per 30 seconds per actor and keeps the latest in memory', () => {
		const { app, db, time } = setup();
		app.presence.touch('codex', 'mcp');
		const first = rows(db)[0].last_seen_at;
		time.now += 10_000;
		app.presence.touch('codex', 'mcp');
		expect(rows(db)[0].last_seen_at).toBe(first);
		expect(app.presence.list()[0].lastSeenAt).toBe(new Date(time.now).toISOString());
		time.now += 20_000;
		app.presence.touch('codex', 'mcp');
		expect(rows(db)[0].last_seen_at).toBe(new Date(time.now).toISOString());
	});

	it('emits when an agent comes online and at most every 30 seconds after', () => {
		const { app, time, events } = setup();
		app.presence.touch('codex', 'mcp');
		expect(events).toHaveLength(1);
		time.now += 5000;
		app.presence.touch('codex', 'mcp');
		expect(events).toHaveLength(1);
		time.now += 25_000;
		app.presence.touch('codex', 'mcp');
		expect(events).toHaveLength(2);
		time.now += PRESENCE_ONLINE_MS;
		app.presence.touch('codex', 'mcp');
		expect(events).toHaveLength(3);
		expect(events[2].agents[0].actor).toBe('codex');
	});

	it('survives a restart on the same database', () => {
		const first = setup();
		first.app.presence.touch('codex', 'mcp');
		const second = setup(first.db, first.time.now + 60_000);
		expect(second.app.presence.list()).toMatchObject([{ actor: 'codex', transport: 'mcp' }]);
	});

	it('marks an agent online for MCP tools/list and REST reads', async () => {
		const { app, events } = setup();
		await handleMcp(app, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'codex');
		expect(app.presence.list()).toMatchObject([{ actor: 'codex', transport: 'mcp' }]);
		expect(events).toHaveLength(1);

		await execute(app, operationsByName.get('list_projects')!, {}, { actor: 'claude-code' });
		expect(
			app.presence
				.list()
				.map((a) => [a.actor, a.transport])
				.sort()
		).toEqual([
			['claude-code', 'api'],
			['codex', 'mcp']
		]);

		const agents = (await execute(
			app,
			operationsByName.get('list_agents')!,
			{},
			{ actor: 'codex' }
		)) as { actor: string; status: string }[];
		expect(agents.every((a) => a.status === 'online')).toBe(true);
	});
});
