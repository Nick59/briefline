/** Storage can be blocked or full; callers fall back to their default and keep going. */
export function readStored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function writeStored(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* The choice only lasts for this page load. */
	}
}
