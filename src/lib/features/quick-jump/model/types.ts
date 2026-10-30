export type TicketKind = 'task' | 'epic' | 'project';

export interface TicketHit {
	kind: TicketKind;
	key: string;
	title: string;
	externalKey: string | null;
	projectKey: string;
	epicKey: string | null;
	epicTitle: string | null;
	path: string;
	exact: boolean;
}
