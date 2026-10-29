<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { Input } from '#lib/shared/ui/primitives/input/index.js';
	import { Field } from '#lib/shared/ui/field/index.ts';

	let { error, next }: { error?: string; next: string } = $props();
</script>

<div class="grid min-h-dvh place-items-center px-4">
	<form method="POST" use:enhance class="grid w-full max-w-sm gap-4 rounded-xl border bg-card p-6">
		<div class="space-y-1">
			<p class="font-mono text-sm font-semibold">
				project<span class="text-muted-foreground">/</span>ai
			</p>
			<h1 class="text-lg font-semibold">Sign in</h1>
			<p class="text-sm text-muted-foreground">Enter the server's API token (PM_API_TOKEN).</p>
		</div>
		<input type="hidden" name="next" value={next} />
		<Field label="API token" for="token">
			<Input
				id="token"
				name="token"
				type="password"
				required
				autocomplete="current-password"
				aria-invalid={error ? 'true' : undefined}
			/>
		</Field>
		{#if error}<p class="text-sm text-danger" role="alert">{error}</p>{/if}
		<Button type="submit">Continue</Button>
	</form>
</div>
