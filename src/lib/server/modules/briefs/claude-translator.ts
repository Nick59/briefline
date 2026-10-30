import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { briefSchema } from '#lib/shared/domain/schemas.ts';
import type { BriefDraft, BriefInput, BriefTranslator } from './translator.ts';

const SYSTEM = `You translate engineering specs written by AI coding agents into briefs for humans who are not engineers:
product managers, designers, and stakeholders. Describe outcomes and impact, not code. Keep each list item to one
plain sentence. Never invent requirements that the spec does not state; leave a list empty when the spec is silent.`;

export class ClaudeTranslator implements BriefTranslator {
	readonly id: string;
	readonly #client: Anthropic;

	constructor(
		apiKey: string,
		private readonly model: string
	) {
		this.#client = new Anthropic({ apiKey });
		this.id = `claude:${model}`;
	}

	async translate({ title, content, context }: BriefInput): Promise<BriefDraft> {
		const response = await this.#client.beta.messages.parse({
			model: this.model,
			max_tokens: 16000,
			betas: ['server-side-fallback-2026-07-01'],
			fallbacks: 'default',
			output_config: { effort: 'medium', format: betaZodOutputFormat(briefSchema) },
			system: SYSTEM,
			messages: [
				{
					role: 'user',
					content: `${context ? `Context: ${context}\n\n` : ''}Spec title: ${title}\n\n<spec>\n${content}\n</spec>`
				}
			]
		});
		if (response.stop_reason === 'refusal')
			throw new Error('Claude declined to translate this spec');
		if (!response.parsed_output)
			throw new Error(`Claude returned no brief (stop reason: ${response.stop_reason})`);
		return response.parsed_output;
	}
}
