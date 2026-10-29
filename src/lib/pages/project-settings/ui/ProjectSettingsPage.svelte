<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Project, TicketProviderInfo } from '#lib/shared/domain/types.ts';
	import { PageHeader } from '#lib/shared/ui/page-header/index.ts';
	import { Section } from '#lib/shared/ui/section/index.ts';
	import { ProjectDetailsForm, TicketingForm } from '#lib/features/configure-ticketing/index.ts';
	import { DeleteButton } from '#lib/features/delete-entity/index.ts';
	import { Crumbs } from '#lib/widgets/app-shell/index.ts';

	let { project, providers }: { project: Project; providers: TicketProviderInfo[] } = $props();
</script>

<div class="max-w-3xl space-y-10">
	<PageHeader title="Settings">
		{#snippet eyebrow()}
			<Crumbs
				items={[
					{ label: project.name, href: resolve('/projects/[project]', { project: project.key }) },
					{ label: 'Settings' }
				]}
			/>
		{/snippet}
	</PageHeader>

	<Section title="Project">
		<div class="rounded-xl border bg-card p-5"><ProjectDetailsForm {project} /></div>
	</Section>

	<Section title="Ticketing">
		<div class="rounded-xl border bg-card p-5"><TicketingForm {project} {providers} /></div>
	</Section>

	<Section title="Danger zone">
		<div
			class="flex items-center justify-between gap-4 rounded-xl border border-danger/30 bg-card p-5"
		>
			<div>
				<p class="text-sm font-medium">Delete this project</p>
				<p class="text-sm text-muted-foreground">
					Removes every epic, task, spec and log. External tickets are not touched.
				</p>
			</div>
			<DeleteButton
				operation="delete_project"
				input={{ project: project.id }}
				what="project {project.key}"
				consequence="Every epic, task, spec and log in it is deleted. This cannot be undone."
				redirectTo={resolve('/')}
				label="Delete"
			/>
		</div>
	</Section>
</div>
