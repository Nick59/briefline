import type { Attachment } from 'svelte/attachments';

export interface DropTarget {
	zone: string;
	/** The item the dragged one lands before; null means at the end of the zone. */
	beforeId: string | null;
}

export interface DropEvent extends DropTarget {
	id: string;
	fromZone: string;
}

interface SortableOptions {
	ondrop: (event: DropEvent) => void;
	/** Touch drags start after a long press, so a quick swipe still scrolls the page. */
	touchDelay?: number;
}

const DRAG_THRESHOLD = 5;
const TOUCH_SLOP = 8;
const EDGE = 64;
const SCROLL_STEP = 14;
/** Elements inside an item that keep their own pointer behaviour. */
const INTERACTIVE = 'button, input, textarea, select, [role="menuitem"], [data-dnd-ignore]';

/**
 * Pointer-based sortable lists for mouse, pen and touch. Mark lists with `zone(...)` and their
 * items with `item(...)`; read `active` and `over` to render the dragged item and the drop line.
 */
export class Sortable {
	active = $state<{ id: string; zone: string } | null>(null);
	over = $state<DropTarget | null>(null);

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a DOM registry, never rendered
	#zones = new Map<string, HTMLElement>();
	#options: SortableOptions;

	constructor(options: SortableOptions) {
		this.#options = options;
	}

	zone(name: string): Attachment<HTMLElement> {
		return (node) => {
			this.#zones.set(name, node);
			node.dataset.dndZone = name;
			return () => {
				if (this.#zones.get(name) === node) this.#zones.delete(name);
			};
		};
	}

	item(id: string, zone: string): Attachment<HTMLElement> {
		return (node) => {
			node.dataset.dndId = id;
			// The browser's own drag (of links and images) would compete with ours.
			const stopNativeDrag = (event: DragEvent) => event.preventDefault();
			const onPointerDown = (event: PointerEvent) => this.#press(event, node, id, zone);
			// Block scrolling and the long-press menu once a touch drag has started.
			const onTouchMove = (event: TouchEvent) => {
				if (this.active?.id === id) event.preventDefault();
			};
			const onContextMenu = (event: Event) => {
				if (this.active?.id === id) event.preventDefault();
			};
			node.addEventListener('dragstart', stopNativeDrag);
			node.addEventListener('pointerdown', onPointerDown);
			node.addEventListener('touchmove', onTouchMove, { passive: false });
			node.addEventListener('contextmenu', onContextMenu);
			return () => {
				node.removeEventListener('dragstart', stopNativeDrag);
				node.removeEventListener('pointerdown', onPointerDown);
				node.removeEventListener('touchmove', onTouchMove);
				node.removeEventListener('contextmenu', onContextMenu);
			};
		};
	}

	#press(down: PointerEvent, node: HTMLElement, id: string, zone: string) {
		if ((down.target as Element).closest('[data-dnd-id]') !== node) return;
		if (down.button !== 0 || this.active || (down.target as Element).closest(INTERACTIVE)) return;
		const isTouch = down.pointerType === 'touch';
		const start = { x: down.clientX, y: down.clientY };
		let pointer = start;
		let ghost: HTMLElement | null = null;
		let offset = { x: 0, y: 0 };
		let frame = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const begin = () => {
			const rect = node.getBoundingClientRect();
			offset = { x: start.x - rect.left, y: start.y - rect.top };
			ghost = node.cloneNode(true) as HTMLElement;
			ghost.removeAttribute('data-dnd-id');
			Object.assign(ghost.style, {
				position: 'fixed',
				left: '0',
				top: '0',
				width: `${rect.width}px`,
				margin: '0',
				zIndex: '60',
				pointerEvents: 'none',
				boxShadow: '0 12px 32px -8px rgb(0 0 0 / 0.35)',
				transition: 'none'
			});
			ghost.setAttribute('aria-hidden', 'true');
			document.body.append(ghost);
			document.body.style.userSelect = 'none';
			document.body.style.cursor = 'grabbing';
			this.active = { id, zone };
			if (isTouch) navigator.vibrate?.(10);
			place();
			frame = requestAnimationFrame(autoScroll);
		};

		const place = () => {
			if (!ghost) return;
			ghost.style.transform = `translate(${pointer.x - offset.x}px, ${pointer.y - offset.y}px) rotate(1.5deg)`;
			this.over = this.#hitTest(pointer.x, pointer.y, id);
		};

		const autoScroll = () => {
			const dy = pointer.y < EDGE ? -SCROLL_STEP : pointer.y > innerHeight - EDGE ? SCROLL_STEP : 0;
			if (dy) {
				scrollBy(0, dy);
				place();
			}
			frame = requestAnimationFrame(autoScroll);
		};

		const onMove = (event: PointerEvent) => {
			if (event.pointerId !== down.pointerId) return;
			pointer = { x: event.clientX, y: event.clientY };
			const distance = Math.hypot(pointer.x - start.x, pointer.y - start.y);
			if (!ghost) {
				// On touch, moving before the long press completes means the user is scrolling.
				if (isTouch) {
					if (distance > TOUCH_SLOP) finish(false);
				} else if (distance > DRAG_THRESHOLD) begin();
				return;
			}
			event.preventDefault();
			place();
		};

		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') finish(false);
		};

		const finish = (drop: boolean) => {
			clearTimeout(timer);
			cancelAnimationFrame(frame);
			removeEventListener('pointermove', onMove);
			removeEventListener('pointerup', onUp);
			removeEventListener('pointercancel', onCancel);
			removeEventListener('keydown', onKey);
			if (!ghost) return;

			ghost.remove();
			document.body.style.userSelect = '';
			document.body.style.cursor = '';
			// A drag must not also count as a click on the card's link.
			const swallow = (event: MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();
			};
			addEventListener('click', swallow, { capture: true, once: true });
			setTimeout(() => removeEventListener('click', swallow, { capture: true }), 0);

			const target = drop ? this.over : null;
			this.active = null;
			this.over = null;
			if (target) this.#options.ondrop({ id, fromZone: zone, ...target });
		};

		const onUp = (event: PointerEvent) => event.pointerId === down.pointerId && finish(true);
		const onCancel = (event: PointerEvent) => event.pointerId === down.pointerId && finish(false);

		addEventListener('pointermove', onMove, { passive: false });
		addEventListener('pointerup', onUp);
		addEventListener('pointercancel', onCancel);
		addEventListener('keydown', onKey);
		if (isTouch) timer = setTimeout(begin, this.#options.touchDelay ?? 250);
	}

	#hitTest(x: number, y: number, draggedId: string): DropTarget | null {
		for (const [zone, element] of this.#zones) {
			const rect = element.getBoundingClientRect();
			if (rect.width === 0 || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
				continue;
			const items = [...element.querySelectorAll<HTMLElement>('[data-dnd-id]')].filter(
				(item) => item.dataset.dndId !== draggedId
			);
			const before = items.find((item) => {
				const box = item.getBoundingClientRect();
				return y < box.top + box.height / 2;
			});
			return { zone, beforeId: before?.dataset.dndId ?? null };
		}
		return null;
	}
}
