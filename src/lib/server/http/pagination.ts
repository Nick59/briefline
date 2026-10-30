import type { Page, PageView } from '#lib/shared/domain/types.ts';

export const ACTIVITY_PAGE_SIZE = 10;

/** Reads a 1-based page from the URL, clamps it to the available pages and loads that slice. */
export function loadPage<T>(
	url: URL,
	param: string,
	fetchPage: (paging: { limit: number; offset: number }) => Page<T>,
	size = ACTIVITY_PAGE_SIZE
): PageView<T> {
	const requested = Number.parseInt(url.searchParams.get(param) ?? '', 10);
	let page = Number.isFinite(requested) && requested > 0 ? requested : 1;
	let result = fetchPage({ limit: size, offset: (page - 1) * size });
	const pageCount = Math.max(1, Math.ceil(result.total / size));
	if (page > pageCount) {
		page = pageCount;
		result = fetchPage({ limit: size, offset: (page - 1) * size });
	}
	return { ...result, page, pageCount };
}
