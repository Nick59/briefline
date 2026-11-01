import type { CodingLevel, ProfileRole } from '#lib/shared/domain/constants.ts';
import type { UserProfile } from '#lib/shared/domain/types.ts';
import { one, run, type Db } from '../../db/connection.ts';

interface ProfileRow {
	name: string;
	role: string;
	role_other: string | null;
	coding_level: string;
	language: string | null;
	updated_at: string;
}

export class ProfileRepository {
	constructor(private readonly db: Db) {}

	get(): UserProfile | null {
		const row = one<ProfileRow>(this.db, 'SELECT * FROM user_profile WHERE id = 1');
		return row
			? {
					name: row.name,
					role: row.role as ProfileRole,
					roleOther: row.role_other,
					codingLevel: row.coding_level as CodingLevel,
					language: row.language,
					updatedAt: row.updated_at
				}
			: null;
	}

	save(profile: UserProfile) {
		run(
			this.db,
			`INSERT INTO user_profile (id, name, role, role_other, coding_level, language, updated_at)
			 VALUES (1, :name, :role, :roleOther, :codingLevel, :language, :updatedAt)
			 ON CONFLICT(id) DO UPDATE SET name = :name, role = :role, role_other = :roleOther,
			 coding_level = :codingLevel, language = :language, updated_at = :updatedAt`,
			{ ...profile }
		);
	}
}
