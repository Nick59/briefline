import { deserialize } from '$app/forms';
import { refreshAll } from '$app/navigation';
import { toast } from 'svelte-sonner';

export type OperationResult<T = unknown> = { ok: true; result: T } | { ok: false; message: string };

/**
 * Runs an API operation (see server/api/operations.ts) through the page's `run` form action,
 * then refreshes the page data. Every page that uses it exports `actions` from operation-actions.ts.
 */
export async function runOperation<T = unknown>(
	op: string,
	input: Record<string, unknown>,
	options: { success?: string; refresh?: boolean } = {}
): Promise<OperationResult<T>> {
	const body = new FormData();
	body.set('_op', op);
	body.set('_json', JSON.stringify(input));

	let outcome: OperationResult<T>;
	try {
		const response = await fetch('?/run', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		if (result.type === 'success') outcome = { ok: true, result: result.data?.result as T };
		else if (result.type === 'failure')
			outcome = { ok: false, message: String(result.data?.message ?? 'Request failed') };
		else if (result.type === 'error')
			outcome = { ok: false, message: result.error?.message ?? 'Unexpected error' };
		else outcome = { ok: false, message: 'Unexpected redirect' };
	} catch (error) {
		outcome = { ok: false, message: error instanceof Error ? error.message : 'Network error' };
	}

	if (outcome.ok) {
		if (options.success) toast.success(options.success);
		if (options.refresh !== false) await refreshAll();
	} else {
		toast.error(outcome.message);
	}
	return outcome;
}
