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
			placeholder: 'https://tracker/browse/{key}'
		}
	],
	envVars: [],
	ticketUrl(ref, settings) {
		return settings.ticketUrlTemplate
			? settings.ticketUrlTemplate.replace('{key}', encodeURIComponent(ref.key))
			: null;
	},
	async push() {}
};
