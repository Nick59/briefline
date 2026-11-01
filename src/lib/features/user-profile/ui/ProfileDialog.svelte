<script lang="ts">
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';
	import { runOperation } from '#lib/shared/lib/run-operation.ts';
	import {
		CODING_LEVELS,
		CODING_LEVEL_LABELS,
		PROFILE_ROLES,
		PROFILE_ROLE_LABELS,
		type CodingLevel,
		type ProfileRole
	} from '#lib/shared/domain/constants.ts';
	import type { UserProfile } from '#lib/shared/domain/types.ts';
	import ChoiceList from './ChoiceList.svelte';

	interface Props {
		open: boolean;
		profile: UserProfile | null;
		/** Set on first launch: shows the welcome text and a Later button instead of a close button. */
		onlater?: () => void;
		onclose?: () => void;
	}

	let { open, profile, onlater, onclose }: Props = $props();

	let name = $state('');
	let role = $state<ProfileRole>('developer');
	let roleOther = $state('');
	let codingLevel = $state<CodingLevel>('intermediate');
	let language = $state('');
	let busy = $state(false);

	const welcome = $derived(profile === null);
	const roleOptions = PROFILE_ROLES.map((value) => ({ value, label: PROFILE_ROLE_LABELS[value] }));
	const levelOptions = CODING_LEVELS.map((value) => ({
		value,
		label: CODING_LEVEL_LABELS[value].label,
		hint: CODING_LEVEL_LABELS[value].hint
	}));

	$effect(() => {
		if (!open) return;
		name = profile?.name ?? '';
		role = profile?.role ?? 'developer';
		roleOther = profile?.roleOther ?? '';
		codingLevel = profile?.codingLevel ?? 'intermediate';
		language = profile?.language ?? '';
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const outcome = await runOperation(
			'update_user_profile',
			{
				name,
				role,
				codingLevel,
				...(role === 'other' && roleOther.trim() ? { roleOther } : {}),
				...(language.trim() ? { language } : {})
			},
			{ success: welcome ? undefined : 'Profile saved' }
		);
		busy = false;
		if (outcome.ok) onclose?.();
	}
</script>

<Dialog.Root
	{open}
	onOpenChange={(value) => {
		if (!value) (welcome ? onlater : onclose)?.();
	}}
>
	<Dialog.Content
		showCloseButton={!welcome}
		interactOutsideBehavior={welcome ? 'ignore' : 'close'}
		escapeKeydownBehavior={welcome ? 'ignore' : 'close'}
		class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
	>
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header class={welcome ? undefined : 'pr-10'}>
				<Dialog.Title>{welcome ? 'Welcome to Briefline' : 'Your profile'}</Dialog.Title>
				<Dialog.Description>
					Agents read this to adapt how they write to you: their tone and how technical their briefs
					are.
				</Dialog.Description>
			</Dialog.Header>
			<Field label="Name" for="profile-name">
				<Input
					id="profile-name"
					bind:value={name}
					required
					maxlength={80}
					autocomplete="name"
					placeholder="Alex"
				/>
			</Field>
			<ChoiceList
				name="profile-role"
				legend="What's your role?"
				options={roleOptions}
				bind:value={role}
			/>
			{#if role === 'other'}
				<Field label="Your role" for="profile-role-other">
					<Input
						id="profile-role-other"
						bind:value={roleOther}
						maxlength={80}
						placeholder="Data analyst"
					/>
				</Field>
			{/if}
			<ChoiceList
				name="profile-level"
				legend="How comfortable are you with code?"
				options={levelOptions}
				bind:value={codingLevel}
			/>
			<Field
				label="Preferred language for briefs (optional)"
				for="profile-language"
				hint="Free text, for example English or French."
			>
				<Input id="profile-language" bind:value={language} maxlength={60} placeholder="English" />
			</Field>
			<Dialog.Footer>
				{#if welcome}
					<Button type="button" variant="outline" onclick={() => onlater?.()}>Later</Button>
				{:else}
					<Button type="button" variant="outline" onclick={() => onclose?.()}>Cancel</Button>
				{/if}
				<Button type="submit" disabled={busy || !name.trim()}>Save profile</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
