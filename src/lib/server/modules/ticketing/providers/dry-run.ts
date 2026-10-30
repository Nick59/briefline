import type { TicketProvider } from '../provider.ts';

/** Records what would be sent without calling anything. Useful for demos and for testing a workflow. */
export const dryRunProvider: TicketProvider = {
	id: 'dry-run',
	label: 'Dry run',
	description: 'Logs every ticket update in the sync log without calling an external system.',
	settings: [
		{
			name: 'ticketUrlTemplate',
			label: 'Ticket URL template',
			required: false,
			scope: 'connection',
			placeholder: 'https://tracker/browse/{key}'
		}
	],
	envVars: [],
	secretLabel: null,
	secretEnvVar: null,
	supportsStates: true,
	ticketUrl(ref, settings) {
		return settings.ticketUrlTemplate
			? settings.ticketUrlTemplate.replace('{key}', encodeURIComponent(ref.key))
			: null;
	},
	async testConnection() {},
	async listStates() {
		return [
			{ id: 'todo', name: 'To do', group: 'unstarted' },
			{ id: 'in_progress', name: 'In progress', group: 'started' },
			{ id: 'done', name: 'Done', group: 'completed' }
		];
	},
	async push() {}
};
