/** True when `path` is `href` or lives under it; `/epics/E1` must not match `/epics/E11`. */
export const pathIsWithin = (path: string, href: string) =>
	path === href || path.startsWith(`${href}/`);
