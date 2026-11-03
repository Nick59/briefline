import { createHmac } from 'node:crypto';
import {
	expectOk,
	providerFetch,
	requireSetting,
	TicketProviderError,
	TIMEOUT_MS,
	type ProviderContext,
	type TicketContext,
	type TicketProvider
} from '../provider.ts';

function endpoint(ctx: ProviderContext): URL {
	const url = new URL(requireSetting(ctx, 'url'));
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new TicketProviderError('Webhook URL must use http or https');
	}
	return url;
}

export const webhookProvider: TicketProvider = {
	reservedHeaders: ['x-pm-signature'],
	id: 'webhook',
	label: 'Generic webhook',
	description:
		'POSTs every update as JSON to your endpoint. Bridge it to any ticketing system you run.',
	settings: [
		{
			name: 'url',
			label: 'Endpoint URL',
			required: true,
			scope: 'connection',
			placeholder: 'https://example.com/hooks/tickets'
		},
		{
			name: 'ticketUrlTemplate',
			label: 'Ticket URL template',
			required: false,
			scope: 'connection',
			placeholder: 'https://tracker/browse/{key}'
		}
	],
	envVars: ['PM_WEBHOOK_SECRET'],
	secretLabel: 'Signing secret (optional)',
	secretEnvVar: 'PM_WEBHOOK_SECRET',
	supportsStates: false,
	ticketUrl(ref, settings) {
		return settings.ticketUrlTemplate
			? settings.ticketUrlTemplate.replace('{key}', encodeURIComponent(ref.key))
			: null;
	},
	async testConnection(ctx) {
		endpoint(ctx);
	},
	async listStates() {
		return [];
	},
	async syncComment(ctx, comment) {
		await send(ctx, 'ticket.comment', {
			comment: {
				...comment,
				action: comment.body === null ? 'delete' : comment.remoteId ? 'update' : 'create'
			}
		});
		return comment.body === null ? null : comment.id;
	},
	async push(ctx, update) {
		await send(ctx, 'ticket.update', { update });
	}
};

async function send(ctx: TicketContext, event: string, data: object) {
	const url = endpoint(ctx);
	const body = JSON.stringify({
		event,
		ticket: ctx.ref,
		...data,
		sentAt: new Date().toISOString()
	});
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	const secret = ctx.secret;
	if (secret)
		headers['x-pm-signature'] = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
	const response = await providerFetch(
		ctx,
		'Webhook',
		String(url),
		{ method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) },
		{ json: false }
	);
	await expectOk(response, 'Webhook', ctx);
}
