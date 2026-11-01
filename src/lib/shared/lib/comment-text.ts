const VERBS = {
	'task.commented': 'Commented on',
	'task.comment_updated': 'Edited a comment on',
	'task.comment_deleted': 'Deleted a comment on'
} as const;

export const isCommentEvent = (type: string): type is keyof typeof VERBS => type in VERBS;

/** `Commented on SHOP-12 “Add search”`; the title is dropped when the entry has none. */
export function commentPhrase(
	type: keyof typeof VERBS,
	key: string | null,
	title: string | null
): string {
	return [VERBS[type], key, title && `“${title}”`].filter(Boolean).join(' ');
}
