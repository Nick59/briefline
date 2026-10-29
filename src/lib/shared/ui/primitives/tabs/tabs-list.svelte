<script lang="ts" module>
	import { tabsListVariants, type TabsListVariant } from './tabs-list.variants.ts';
</script>

<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '#lib/shared/lib/utils.js';

	let {
		ref = $bindable(null),
		variant = 'default',
		class: className,
		...restProps
	}: TabsPrimitive.ListProps & {
		variant?: TabsListVariant;
	} = $props();
</script>

<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	data-variant={variant}
	class={cn(tabsListVariants({ variant }), className)}
	{...restProps}
/>
