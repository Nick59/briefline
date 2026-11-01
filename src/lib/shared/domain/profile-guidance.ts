import { PROFILE_ROLE_LABELS, type CodingLevel } from './constants.ts';
import type { UserProfile } from './types.ts';

const LEVEL_GUIDANCE: Record<CodingLevel, string> = {
	none: 'Write briefs and replies in plain language, avoid jargon, explain technical terms, and leave code out.',
	beginner:
		'Write briefs and replies in plain language, avoid jargon, explain technical terms, and keep code snippets short and explained.',
	intermediate:
		'Use normal technical vocabulary but explain unusual terms; include code detail only where it helps the decision.',
	expert: 'Be concise and technical; code-level detail is welcome.'
};

export const roleLabel = (profile: Pick<UserProfile, 'role' | 'roleOther'>): string =>
	profile.role === 'other' && profile.roleOther
		? profile.roleOther
		: PROFILE_ROLE_LABELS[profile.role].toLowerCase();

export const codingLevelPhrase = (level: CodingLevel): string =>
	level === 'none' ? 'does not read code' : `${level} coder`;

/** One paragraph that tells an agent how to write for this person. */
export function profileGuidance(profile: UserProfile): string {
	const parts = [
		`The user is ${profile.name}, ${roleLabel(profile)} (${codingLevelPhrase(profile.codingLevel)}).`,
		LEVEL_GUIDANCE[profile.codingLevel]
	];
	if (profile.language) parts.push(`Write briefs in ${profile.language}.`);
	return parts.join(' ');
}
