<script lang="ts">
	import ZoomInIcon from '@lucide/svelte/icons/zoom-in';
	import ZoomOutIcon from '@lucide/svelte/icons/zoom-out';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import * as Dialog from '#lib/shared/ui/primitives/dialog/index.js';
	import { Button } from '#lib/shared/ui/primitives/button/index.js';
	import {
		BUTTON_STEP,
		distance,
		fitView,
		midpoint,
		panBy,
		wheelFactor,
		zoomAt,
		type Point,
		type Size,
		type View
	} from './zoom-math.ts';

	interface Props {
		open: boolean;
		/** Sanitized SVG markup produced by the diagram renderer. */
		svg: string;
	}

	let { open = $bindable(false), svg }: Props = $props();

	let viewport = $state<HTMLDivElement | null>(null);
	let content = $state<HTMLDivElement | null>(null);
	let view = $state<View>({ x: 0, y: 0, scale: 1 });
	let dragging = $state(false);

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping only, never rendered
	const pointers = new Map<number, Point>();
	let pinchDistance = 0;

	function viewportSize(): Size {
		const rect = viewport!.getBoundingClientRect();
		return { width: rect.width, height: rect.height };
	}

	function contentSize(): Size {
		const element = content!.querySelector('svg');
		const box = element?.viewBox.baseVal;
		if (box && box.width > 0) return { width: box.width, height: box.height };
		return { width: content!.offsetWidth, height: content!.offsetHeight };
	}

	function fit() {
		if (viewport && content) view = fitView(contentSize(), viewportSize());
	}

	function local(event: { clientX: number; clientY: number }): Point {
		const rect = viewport!.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	function zoomFromCenter(factor: number) {
		const size = viewportSize();
		view = zoomAt(view, factor, { x: size.width / 2, y: size.height / 2 });
	}

	// Sizes the cloned SVG from its viewBox so scaling the wrapper keeps it vector-sharp.
	function prepare(node: HTMLDivElement) {
		const element = node.querySelector('svg');
		const box = element?.viewBox.baseVal;
		if (element && box && box.width > 0) {
			element.removeAttribute('style');
			element.setAttribute('width', String(box.width));
			element.setAttribute('height', String(box.height));
		}
		fit();
	}

	function surface(node: HTMLDivElement) {
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			view = zoomAt(view, wheelFactor(event.deltaY, event.ctrlKey), local(event));
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		let fitted = false;
		const observer = new ResizeObserver(() => {
			if (fitted) return;
			fitted = true;
			fit();
		});
		observer.observe(node);
		return () => {
			node.removeEventListener('wheel', onWheel);
			observer.disconnect();
		};
	}

	function onPointerDown(event: PointerEvent) {
		viewport!.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, local(event));
		dragging = true;
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinchDistance = distance(a, b);
		}
	}

	function onPointerMove(event: PointerEvent) {
		const previous = pointers.get(event.pointerId);
		if (!previous) return;
		const current = local(event);
		pointers.set(event.pointerId, current);
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			const next = distance(a, b);
			if (pinchDistance > 0) view = zoomAt(view, next / pinchDistance, midpoint(a, b));
			pinchDistance = next;
		} else if (pointers.size === 1) {
			view = panBy(view, current.x - previous.x, current.y - previous.y);
		}
	}

	function onPointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
		pinchDistance = 0;
		dragging = pointers.size > 0;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.key === '+' || event.key === '=') zoomFromCenter(BUTTON_STEP);
		else if (event.key === '-' || event.key === '_') zoomFromCenter(1 / BUTTON_STEP);
		else if (event.key === '0') fit();
		else return;
		event.preventDefault();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="inset-0 top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_1fr] gap-0 rounded-none p-0 sm:max-w-none"
		onkeydown={onKeydown}
	>
		<header class="flex items-center justify-between gap-2 border-b px-3 py-2">
			<Dialog.Title>Diagram</Dialog.Title>
			<Dialog.Description class="sr-only">
				Drag to pan. Scroll or pinch to zoom. Keys: plus, minus and 0 to fit.
			</Dialog.Description>
			<div class="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Zoom out"
					onclick={() => zoomFromCenter(1 / BUTTON_STEP)}><ZoomOutIcon /></Button
				>
				<span class="w-12 text-center text-xs text-muted-foreground tabular-nums" aria-live="polite"
					>{Math.round(view.scale * 100)}%</span
				>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Zoom in"
					onclick={() => zoomFromCenter(BUTTON_STEP)}><ZoomInIcon /></Button
				>
				<Button variant="ghost" size="sm" onclick={fit}><MaximizeIcon />Fit</Button>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm">Close</Button>
					{/snippet}
				</Dialog.Close>
			</div>
		</header>
		<div
			bind:this={viewport}
			{@attach surface}
			class="relative min-h-0 touch-none overflow-hidden bg-card select-none {dragging
				? 'cursor-grabbing'
				: 'cursor-grab'}"
			role="application"
			aria-label="Diagram viewer"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>
			<div
				bind:this={content}
				{@attach prepare}
				class="absolute top-0 left-0 origin-top-left will-change-transform [&_svg]:block [&_svg]:max-w-none"
				style:transform="translate({view.x}px, {view.y}px) scale({view.scale})"
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG comes from mermaid with securityLevel strict -->
				{@html svg}
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
