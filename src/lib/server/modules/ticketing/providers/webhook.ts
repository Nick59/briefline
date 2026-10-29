import { createHmac } from 'node:crypto';
import {
	expectOk,
	requireSetting,
	TicketProviderError,
	TIMEOUT_MS,
	type TicketProvider
} from '../provider.ts';

export const webhookProvider: TicketProvider = {
	id: 'webhook',
	label: 'Generic webhook',
	description:
		'POSTs every update as JSON to your endpoint. Bridge it to any ticketing system you run.',
	settings: [
		{
			name: 'url',
			label: 'Endpoint URL',
			required: true,
			placeholder: 'https://example.com/hooks/tickets'
		},
		{
			name: 'ticketUrlTemplate',
			label: 'Ticket URL template',
			required: false,
			placeholder: 'https://tracker/browse/{key}'
		}
	],
	envVars: ['PM_WEBHOOK_SECRET'],
	ticketUrl(ref, settings) {
		return settings.ticketUrlTemplate
			? settings.ticketUrlTemplate.replace('{key}', encodeURIComponent(ref.key))
			: null;
	},
	async push(ctx, update) {
		const url = new URL(requireSetting(ctx, 'url'));
		if (url.protocol !== 'https:' && url.protocol !== 'http:') {
			throw new TicketProviderError('Webhook URL must use http or https');
		}
		const body = JSON.stringify({
			event: 'ticket.update',
			ticket: ctx.ref,
			update,
			sentAt: new Date().toISOString()
		});
		const headers: Record<string, string> = { 'content-type': 'application/json' };
		const secret = ctx.env.PM_WEBHOOK_SECRET;
		if (secret)
			headers['x-pm-signature'] =
				`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
		const response = await ctx.fetch(url, {
			method: 'POST',
			headers,
			body,
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		await expectOk(response, 'Webhook');
	}
};
