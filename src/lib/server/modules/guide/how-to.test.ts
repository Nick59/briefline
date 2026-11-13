import { describe, expect, it } from 'vitest';
import { execute } from '../../api/execute.ts';
import { operationsByName } from '../../api/operations.ts';
import { testApp } from '../../testing/app.ts';
import { HOW_TO_TOPICS, MCP_INSTRUCTIONS, howTo } from './how-to.ts';

const call = (input: object) =>
	execute(testApp().app, operationsByName.get('how_to')!, input, { actor: 'claude' });

const visible = new Set(
	[...operationsByName.values()]
		.filter((op) => !op.mcp?.hidden && !op.mcp?.excluded)
		.map((op) => op.name)
);

describe('how_to', () => {
	it('lists every topic when none is given', async () => {
		const text = (await call({})) as string;
		for (const topic of HOW_TO_TOPICS) expect(text).toContain(topic);
	});

	it('returns the MCP instructions for workflow', async () => {
		expect(await call({ topic: 'workflow' })).toBe(MCP_INSTRUCTIONS);
	});

	it('rejects an unknown topic', async () => {
		await expect(call({ topic: 'nope' })).rejects.toThrow();
	});

	// workflow is the MCP instructions, which mention non-tool words such as in_progress.
	it.each(HOW_TO_TOPICS.filter((topic) => topic !== 'workflow'))(
		'%s ends with a Tools line naming visible MCP tools',
		(topic) => {
			const last = howTo(topic).trimEnd().split('\n').pop()!;
			expect(last).toMatch(/^Tools: /);
			for (const name of last.slice('Tools: '.length).split(', '))
				expect(visible.has(name), name).toBe(true);
		}
	);
});
