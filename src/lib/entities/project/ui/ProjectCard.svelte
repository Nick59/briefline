<script lang="ts">
	import type { ProjectSummary } from '#lib/shared/domain/types.ts';
	import { pluralize } from '#lib/shared/lib/format.ts';
	import { ProgressBar } from '#lib/shared/ui/progress/index.ts';
	import { ToneBadge } from '#lib/shared/ui/tone-badge/index.ts';

	let { project, href }: { project: ProjectSummary; href: string } = $props();
</script>

<article
	class="group relative flex flex-col gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-foreground/20"
>
	<div class="flex items-start gap-3">
		<span
			class="grid size-10 shrink-0 place-items-center rounded-lg bg-foreground font-mono text-xs font-semibold text-background"
		>
			{project.key.slice(0, 3)}
		</span>
		<div class="min-w-0">
			<h3 class="font-semibold tracking-tight">
				<a
					{href}
					class="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
				>
					{project.name}
				</a>
			</h3>
			<p class="font-mono text-[11px] text-muted-foreground">{project.key}</p>
		</div>
	</div>
	{#if project.description}
		<p class="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
	{/if}
	<div class="mt-auto space-y-2">
		<div class="flex items-center justify-between text-xs text-muted-foreground">
			<span>{pluralize(project.epicCount, 'epic')}</span>
			<span class="font-mono tabular-nums">{project.progress.percent}%</span>
		</div>
		<ProgressBar
			value={project.progress.percent}
			tone="status-done"
			label="{project.name} progress"
		/>
		{#if project.ticketing.provider}
			<ToneBadge tone="neutral" variant="dot">Synced with {project.ticketing.provider}</ToneBadge>
		{/if}
	</div>
</article>
