import { describe, expect, it } from 'vitest';
import { execute } from '../../api/execute.ts';
import { operationsByName } from '../../api/operations.ts';
import { handleMcp } from '../../mcp/handler.ts';
import { profileGuidance } from '#lib/shared/domain/profile-guidance.ts';
import { systemPrompt, userPrompt } from '../briefs/claude-translator.ts';
import { BriefService } from '../briefs/service.ts';
import type { BriefInput, BriefTranslator } from '../briefs/translator.ts';
import { testApp } from '../../testing/app.ts';
import type { UserProfile } from '#lib/shared/domain/types.ts';

const run = (app: ReturnType<typeof testApp>['app'], name: string, input: object = {}) =>
	execute(app, operationsByName.get(name)!, input, { actor: 'claude' }) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const base = { name: 'Nick', role: 'developer', codingLevel: 'expert' } as const;

const initialize = async (app: ReturnType<typeof testApp>['app']) =>
	(
		(await handleMcp(
			app,
			{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
			'claude'
		)) as {
			result: { instructions: string };
		}
	).result.instructions;

describe('user profile', () => {
	it('is null before it is set, then stored and returned with guidance', async () => {
		const { app } = testApp();
		expect(await run(app, 'get_user_profile')).toEqual({ profile: null, guidance: null });
		const saved = await run(app, 'update_user_profile', {
			...base,
			language: ' French ',
			roleOther: 'ignored'
		});
		expect(saved.profile).toMatchObject({
			name: 'Nick',
			role: 'developer',
			roleOther: null,
			codingLevel: 'expert',
			language: 'French'
		});
		expect(saved.guidance).toContain('Be concise and technical');
		expect(saved.guidance).toContain('French');
		expect(await run(app, 'get_user_profile')).toEqual(saved);

		const other = await run(app, 'update_user_profile', {
			name: 'Sam',
			role: 'other',
			roleOther: 'data analyst',
			codingLevel: 'none'
		});
		expect(other.profile).toMatchObject({ roleOther: 'data analyst', language: null });
		expect(app.db.prepare('SELECT COUNT(*) AS n FROM user_profile').get()).toEqual({ n: 1 });
	});

	it('rejects invalid input', async () => {
		const { app } = testApp();
		for (const bad of [
			{ ...base, name: '' },
			{ ...base, name: 'x'.repeat(81) },
			{ ...base, role: 'wizard' },
			{ ...base, codingLevel: 'god' },
			{ role: 'qa', codingLevel: 'none' }
		]) {
			await expect(run(app, 'update_user_profile', bad)).rejects.toMatchObject({ status: 400 });
		}
		expect(await run(app, 'get_user_profile')).toEqual({ profile: null, guidance: null });
	});

	it('derives guidance from the coding level, role and language', () => {
		const profile = (codingLevel: UserProfile['codingLevel'], rest: Partial<UserProfile> = {}) =>
			profileGuidance({
				name: 'Ann',
				role: 'product_owner',
				roleOther: null,
				codingLevel,
				language: null,
				updatedAt: 't',
				...rest
			});
		expect(profile('none')).toContain('avoid jargon, explain technical terms');
		expect(profile('beginner')).toContain('avoid jargon, explain technical terms');
		expect(profile('intermediate')).toContain('normal technical vocabulary');
		expect(profile('expert')).toContain('Be concise and technical; code-level detail is welcome');
		expect(profile('none')).toContain('product owner');
		expect(profile('none', { role: 'other', roleOther: 'analyst', language: 'English' })).toMatch(
			/analyst.*Write briefs in English/
		);
	});

	it('is added to the MCP initialize instructions only when set', async () => {
		const { app } = testApp();
		const before = await initialize(app);
		expect(before).toContain('get_activity_changes');
		expect(before).toContain('get_user_profile');
		expect(before).not.toContain('Guidance:');
		await run(app, 'update_user_profile', { ...base, language: 'French' });
		const after = await initialize(app);
		expect(after).toContain('User: Nick, developer, expert coder, prefers French. Guidance:');
		expect(after).toContain('Be concise and technical');
	});

	it('reaches the translate prompt but not the offline translator', () => {
		const audience = profileGuidance({
			name: 'Ann',
			role: 'designer',
			roleOther: null,
			codingLevel: 'none',
			language: 'French',
			updatedAt: 't'
		});
		expect(systemPrompt(audience)).toContain(audience);
		expect(systemPrompt()).not.toContain('About the reader');
		expect(userPrompt({ title: 'T', content: 'C', audience })).not.toContain('French');
	});

	it('passes the guidance to the translator when a spec is translated', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'PR', name: 'Profile' }, 'test');
		const spec = app.specs.createForProject('PR', { title: 'S', content: 'Body' }, 'test');
		const seen: BriefInput[] = [];
		const translator: BriefTranslator = {
			id: 'fake',
			translate: async (input) => {
				seen.push(input);
				return (await new BriefService(null).translate(input, 'heuristic')) as never;
			}
		};
		const specs = new (app.specs.constructor as new (...args: unknown[]) => typeof app.specs)(
			(app.specs as unknown as { deps: unknown }).deps,
			new BriefService(translator)
		);
		await specs.translate(spec.id, 'test');
		expect(seen[0].audience).toBeUndefined();
		await run(app, 'update_user_profile', { ...base, codingLevel: 'none' });
		await specs.translate(spec.id, 'test');
		expect(seen[1].audience).toContain('plain language');
	});

	it('logs dashboard actions under the profile name', async () => {
		const { app } = testApp();
		app.projects.create({ key: 'DB', name: 'Dash' }, 'test');
		expect(app.profile.dashboardActor()).toBe('dashboard');
		await run(app, 'update_user_profile', base);
		expect(app.profile.dashboardActor()).toBe('Nick');
	});
});
