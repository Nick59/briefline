<script lang="ts">
	import type { UserProfile } from '#lib/shared/domain/types.ts';
	import { CODING_LEVEL_LABELS, PROFILE_ROLE_LABELS } from '#lib/shared/domain/constants.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { ThemeSelect } from '#lib/features/theme-select/index.ts';
	import { ProfileDialog } from '#lib/features/user-profile/index.ts';

	interface Props {
		profile: UserProfile | null;
	}

	let { profile }: Props = $props();
	let editing = $state(false);
</script>

<div class="space-y-8">
	<Section title="Appearance">
		<div class="rounded-xl border bg-card p-5"><ThemeSelect /></div>
	</Section>

	<Section title="Profile">
		<div class="flex items-center justify-between gap-4 rounded-xl border bg-card p-5">
			{#if profile}
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
					<dt class="text-muted-foreground">Name</dt>
					<dd>{profile.name}</dd>
					<dt class="text-muted-foreground">Role</dt>
					<dd>
						{profile.role === 'other' && profile.roleOther
							? profile.roleOther
							: PROFILE_ROLE_LABELS[profile.role]}
					</dd>
					<dt class="text-muted-foreground">Coding level</dt>
					<dd>{CODING_LEVEL_LABELS[profile.codingLevel].label}</dd>
				</dl>
			{:else}
				<p class="text-sm text-muted-foreground">No profile yet</p>
			{/if}
			<Button variant="outline" onclick={() => (editing = true)}>Edit profile</Button>
		</div>
	</Section>
</div>

<ProfileDialog open={editing} {profile} onclose={() => (editing = false)} />
