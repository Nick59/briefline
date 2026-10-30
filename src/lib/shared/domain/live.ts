export interface LiveEvent {
	type: string;
	transport: 'mcp' | null;
	actor: string;
	taskId: string | null;
	epicId: string | null;
	/** What to show: the external ticket key when linked, else the internal key. */
	key: string | null;
	/** The internal key, for links and card highlighting. */
	internalKey: string | null;
	title: string | null;
	data: Record<string, unknown>;
	message: string;
	at: string;
}
