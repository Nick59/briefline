import { fail, type Actions } from '@sveltejs/kit';
import { execute, toFailure } from '../api/execute.ts';
import { operationsByName } from '../api/operations.ts';
import { app } from '../runtime.ts';

/**
 * The dashboard runs API operations through this form action, so the UI and agents share
 * exactly the same validation and business rules. Pages export it as `actions`.
 */
export const operationActions: Actions = {
	run: async ({ request }) => {
		const form = await request.formData();
		const op = operationsByName.get(String(form.get('_op')));
		if (!op) return fail(400, { message: 'Unknown operation' });

		let input: unknown;
		try {
			input = JSON.parse(String(form.get('_json') ?? '{}'));
		} catch {
			return fail(400, { message: 'Invalid payload' });
		}

		try {
			const result = await execute(app(), op, input, { actor: 'dashboard' });
			return { result: JSON.parse(JSON.stringify(result ?? null)) };
		} catch (error) {
			const failure = toFailure(error);
			return fail(failure.status, { message: failure.body.error.message });
		}
	}
};
