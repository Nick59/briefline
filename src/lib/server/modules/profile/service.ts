import { profileGuidance } from '#lib/shared/domain/profile-guidance.ts';
import { userProfileSchema, type UserProfileInput } from '#lib/shared/domain/schemas.ts';
import type { UserProfile, UserProfileView } from '#lib/shared/domain/types.ts';
import type { ServiceDeps } from '../../core/deps.ts';
import { now } from '../../core/ids.ts';

export const DASHBOARD_ACTOR = 'dashboard';

export class ProfileService {
	constructor(private readonly deps: ServiceDeps) {}

	get(): UserProfile | null {
		return this.deps.repos.profile.get();
	}

	view(): UserProfileView {
		const profile = this.get();
		return { profile, guidance: profile ? profileGuidance(profile) : null };
	}

	update(input: UserProfileInput): UserProfileView {
		const data = userProfileSchema.parse(input);
		this.deps.repos.profile.save({
			name: data.name,
			role: data.role,
			roleOther: data.role === 'other' ? data.roleOther || null : null,
			codingLevel: data.codingLevel,
			language: data.language || null,
			updatedAt: now()
		});
		return this.view();
	}

	/** Activity entries from the dashboard carry the person's name once a profile exists. */
	dashboardActor(): string {
		return this.get()?.name ?? DASHBOARD_ACTOR;
	}
}
