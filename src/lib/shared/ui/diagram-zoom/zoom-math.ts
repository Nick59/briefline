export interface View {
	x: number;
	y: number;
	scale: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface Point {
	x: number;
	y: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 8;
export const BUTTON_STEP = 1.25;

export function clampScale(scale: number, min = MIN_SCALE, max = MAX_SCALE): number {
	return Math.min(max, Math.max(min, scale));
}

/** Scales the view by `factor` while keeping the content under `point` (viewport coordinates) fixed. */
export function zoomAt(view: View, factor: number, point: Point): View {
	const scale = clampScale(view.scale * factor);
	const ratio = scale / view.scale;
	return {
		scale,
		x: point.x - (point.x - view.x) * ratio,
		y: point.y - (point.y - view.y) * ratio
	};
}

/** Largest scale that fits the content in the viewport with padding, centered. Never enlarges past 100%. */
export function fitView(content: Size, viewport: Size, padding = 24): View {
	if (content.width <= 0 || content.height <= 0) return { x: 0, y: 0, scale: 1 };
	const availableWidth = Math.max(1, viewport.width - padding * 2);
	const availableHeight = Math.max(1, viewport.height - padding * 2);
	const scale = clampScale(
		Math.min(availableWidth / content.width, availableHeight / content.height, 1)
	);
	return {
		scale,
		x: (viewport.width - content.width * scale) / 2,
		y: (viewport.height - content.height * scale) / 2
	};
}

export function panBy(view: View, dx: number, dy: number): View {
	return { ...view, x: view.x + dx, y: view.y + dy };
}

export function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Wheel zoom factor: ctrl+wheel (trackpad pinch) sends small deltas, so it is scaled up. */
export function wheelFactor(deltaY: number, ctrlKey: boolean): number {
	return Math.exp(-deltaY * (ctrlKey ? 0.01 : 0.002));
}
