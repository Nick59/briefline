import type { TicketProvider, TicketProviderInfo } from './provider.ts';
import { dryRunProvider } from './providers/dry-run.ts';
import { githubProvider } from './providers/github.ts';
import { jiraProvider } from './providers/jira.ts';
import { linearProvider } from './providers/linear.ts';
import { planeProvider } from './providers/plane.ts';
import { webhookProvider } from './providers/webhook.ts';

export class TicketProviderRegistry {
	#providers = new Map<string, TicketProvider>();

	register(provider: TicketProvider): this {
		this.#providers.set(provider.id, provider);
		return this;
	}

	get(id: string): TicketProvider | undefined {
		return this.#providers.get(id);
	}

	list(): TicketProviderInfo[] {
		return [...this.#providers.values()].map(({ id, label, description, settings, envVars }) => ({
			id,
			label,
			description,
			settings,
			envVars
		}));
	}
}

export function createDefaultRegistry(): TicketProviderRegistry {
	return new TicketProviderRegistry()
		.register(githubProvider)
		.register(jiraProvider)
		.register(linearProvider)
		.register(planeProvider)
		.register(webhookProvider)
		.register(dryRunProvider);
}
