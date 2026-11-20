export const SIDEBAR_DEFAULT = 256;
export const SIDEBAR_MIN = 224;
export const SIDEBAR_MAX = 448;
export const SIDEBAR_KEY_STEP = 16;
export const SIDEBAR_STORAGE_KEY = 'briefline:sidebar-width';

export function clampSidebarWidth(width: number): number {
	if (!Number.isFinite(width)) return SIDEBAR_DEFAULT;
	return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width)));
}

export function parseSidebarWidth(raw: string | null): number {
	if (raw === null || raw.trim() === '') return SIDEBAR_DEFAULT;
	return clampSidebarWidth(Number(raw));
}
