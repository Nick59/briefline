import type { HumanBrief } from '#lib/shared/domain/types.ts';
import { now } from '../../core/ids.ts';
import { HeuristicTranslator } from './heuristic-translator.ts';
import type { BriefInput, BriefTranslator } from './translator.ts';

export class BriefService {
	readonly #fallback = new HeuristicTranslator();

	constructor(private readonly primary: BriefTranslator | null) {}

	get engines(): string[] {
		return [this.primary?.id, this.#fallback.id].filter((id): id is string => Boolean(id));
	}

	async translate(input: BriefInput, engine?: string): Promise<HumanBrief> {
		const translator =
			engine === this.#fallback.id || !this.primary ? this.#fallback : this.primary;
		try {
			const draft = await translator.translate(input);
			return { ...draft, source: translator.id, generatedAt: now() };
		} catch (error) {
			if (translator === this.#fallback) throw error;
			console.warn(`[briefs] ${translator.id} failed, using the heuristic translator`, error);
			const draft = await this.#fallback.translate(input);
			return { ...draft, source: `${this.#fallback.id} (fallback)`, generatedAt: now() };
		}
	}
}
