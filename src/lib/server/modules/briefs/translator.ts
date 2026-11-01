import type { HumanBrief } from '#lib/shared/domain/types.ts';

export interface BriefInput {
	title: string;
	content: string;
	/** Context such as the epic or task the spec belongs to. */
	context?: string;
	/** How to write for the reader, derived from the user profile. */
	audience?: string;
}

export type BriefDraft = Omit<HumanBrief, 'source' | 'generatedAt'>;

export interface BriefTranslator {
	readonly id: string;
	translate(input: BriefInput): Promise<BriefDraft>;
}
