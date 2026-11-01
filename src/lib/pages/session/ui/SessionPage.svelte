<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { resolve } from '$app/paths';
	import type {
		Activity,
		PageView,
		ProjectSummary,
		SessionSummary
	} from '#lib/shared/domain/types.ts';
	import { SessionMeta } from '#lib/entities/session/index.ts';
	import { MarkdownViewer } from '#lib/shared/ui/markdown/index.ts';
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { ActivityFeed } from '#lib/widgets/activity-feed/index.ts';

	interface Props {
		session: SessionSummary;
		activity: PageView<Activity>;
		projects: ProjectSummary[];
	}

	let { session, activity, projects }: Props = $props();

	const byId = $derived(
		Object.fromEntries(projects.map((p) => [p.id, { key: p.key, name: p.name }]))
	);
	const started = $derived(
		new Intl.DateTimeFormat('en', { dateStyle: 'full' }).format(new Date(session.startedAt))
	);
</script>

<div class="max-w-4xl space-y-8">
	<PageHeader title="Session · {started}">
		{#snippet eyebrow()}
			<a
				href={resolve('/sessions')}
				class="inline-flex items-center gap-1 underline-offset-2 hover:underline"
				><ArrowLeftIcon class="size-3.5" />Sessions</a
			>
		{/snippet}
	</PageHeader>

	<SessionMeta {session} />

	<Section title="Summary">
		{#if session.summary}
			<div class="rounded-xl border bg-card p-4">
				<MarkdownViewer source={session.summary} />
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">
				The agent has not written a summary for this session.
			</p>
		{/if}
	</Section>

	<ActivityFeed
		title="Activity"
		query={{ session: session.id }}
		items={activity.items}
		page={activity.page}
		pageCount={activity.pageCount}
		total={activity.total}
		pageSize={activity.pageSize}
		projects={byId}
		empty="This session has not changed anything."
	/>
</div>
