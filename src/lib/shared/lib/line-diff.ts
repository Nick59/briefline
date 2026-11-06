export type DiffLine = {
	type: 'same' | 'add' | 'del';
	text: string;
	oldNo?: number;
	newNo?: number;
};

// shortcut: O(n*m) LCS, switch to Myers if specs grow past a few thousand lines
export function lineDiff(before: string, after: string): DiffLine[] {
	const a = before.split('\n');
	const b = after.split('\n');
	const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			out.push({ type: 'same', text: a[i], oldNo: ++i, newNo: ++j });
		} else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
			out.push({ type: 'del', text: a[i], oldNo: ++i });
		} else {
			out.push({ type: 'add', text: b[j], newNo: ++j });
		}
	}
	return out;
}
