export interface LiveEvent {
	type: string;
	transport: 'mcp' | null;
	actor: string;
	taskId: string | null;
	epicId: string | null;
	key: string | null;
	title: string | null;
	data: Record<string, unknown>;
	message: string;
	at: string;
}
