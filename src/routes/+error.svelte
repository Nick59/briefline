<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import { EmptyState } from '#lib/shared/ui/empty-state/index.ts';
</script>

<EmptyState
	title={page.status === 404 ? 'Not found' : 'Something went wrong'}
	description={page.error?.message}
	class="mt-16"
>
	{#snippet action()}<Button href={resolve('/')} variant="outline">Back to projects</Button
		>{/snippet}
</EmptyState>
