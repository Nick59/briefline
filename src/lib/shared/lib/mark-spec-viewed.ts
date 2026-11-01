import { refreshAll } from '$app/navigation';

/** Tells the server that a person opened the spec, then reloads so the Viewed badge appears. */
export async function markSpecViewed(specId: string) {
	const body = new FormData();
	body.set('spec', specId);
	try {
		const response = await fetch('?/viewed', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		if (response.ok) await refreshAll();
	} catch {
		// The badge is a convenience; a failed request must not disturb reading.
	}
}
