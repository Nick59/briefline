import type { HttpMethod, Operation } from './operation.ts';
import { operations } from './operations.ts';

interface Route {
	op: Operation;
	pattern: RegExp;
	params: string[];
}

const routes: Route[] = operations.map((op) => ({
	op,
	params: [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
	pattern: new RegExp(`^${op.path.replace(/\{\w+\}/g, '([^/]+)')}/?$`)
}));

export type RouteMatch =
	{ op: Operation; params: Record<string, string> } | { allowed: HttpMethod[] } | null;

export function matchRoute(method: string, path: string): RouteMatch {
	const allowed: HttpMethod[] = [];
	for (const route of routes) {
		const match = route.pattern.exec(path);
		if (!match) continue;
		if (route.op.method !== method) {
			allowed.push(route.op.method);
			continue;
		}
		const params = Object.fromEntries(
			route.params.map((name, i) => [name, decodeURIComponent(match[i + 1])])
		);
		return { op: route.op, params };
	}
	return allowed.length ? { allowed } : null;
}
