import { tv, type VariantProps } from 'tailwind-variants';

export const tabsListVariants = tv({
	base: 'rounded-lg p-[3px] group-data-horizontal/tabs:h-8 data-[variant=line]:rounded-none group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col',
	variants: {
		variant: {
			default: 'bg-muted',
			line: 'gap-1 bg-transparent'
		}
	},
	defaultVariants: {
		variant: 'default'
	}
});

export type TabsListVariant = VariantProps<typeof tabsListVariants>['variant'];
