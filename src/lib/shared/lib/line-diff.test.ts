import { describe, expect, it } from 'vitest';
import { lineDiff } from './line-diff.ts';

describe('lineDiff', () => {
	it('marks identical text as unchanged', () => {
		expect(lineDiff('a\nb', 'a\nb').map((l) => l.type)).toEqual(['same', 'same']);
	});

	it('reports a pure addition', () => {
		expect(lineDiff('a', 'a\nb')).toEqual([
			{ type: 'same', text: 'a', oldNo: 1, newNo: 1 },
			{ type: 'add', text: 'b', newNo: 2 }
		]);
	});

	it('reports a pure deletion', () => {
		expect(lineDiff('a\nb', 'a')).toEqual([
			{ type: 'same', text: 'a', oldNo: 1, newNo: 1 },
			{ type: 'del', text: 'b', oldNo: 2 }
		]);
	});

	it('reports a modified middle line as a deletion and an addition', () => {
		const diff = lineDiff('a\nb\nc', 'a\nx\nc');
		expect(diff.map((l) => `${l.type}:${l.text}`)).toEqual(['same:a', 'del:b', 'add:x', 'same:c']);
	});

	it('numbers old and new lines independently', () => {
		const diff = lineDiff('a\nb\nc', 'x\na\nc');
		expect(diff).toEqual([
			{ type: 'add', text: 'x', newNo: 1 },
			{ type: 'same', text: 'a', oldNo: 1, newNo: 2 },
			{ type: 'del', text: 'b', oldNo: 2 },
			{ type: 'same', text: 'c', oldNo: 3, newNo: 3 }
		]);
	});
});
