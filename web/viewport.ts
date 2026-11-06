// Pan and zoom math for the canvas surface: no DOM. A view maps world to screen as screen = world * k + (x, y).
export type View = { x: number; y: number; k: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

export const MIN_K = 0.05;
export const MAX_K = 2;
export const ZOOM_STEP = 1.25;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clampK = (k: number) => (Number.isFinite(k) && k > 0 ? clamp(k, MIN_K, MAX_K) : 1);

/** The view that shows `bounds` centred in the viewport with `padding` px on every side, scale clamped. */
export function fitRect(bounds: Rect, viewport: Size, padding = 64): View {
  const aw = Math.max(1, viewport.w - 2 * padding);
  const ah = Math.max(1, viewport.h - 2 * padding);
  const k = bounds.w > 0 && bounds.h > 0 ? clampK(Math.min(aw / bounds.w, ah / bounds.h)) : 1;
  return { k, x: viewport.w / 2 - (bounds.x + bounds.w / 2) * k, y: viewport.h / 2 - (bounds.y + bounds.h / 2) * k };
}

/** Zooms by `factor` keeping the screen point (cx, cy) over the same world point. */
export function zoomAt(v: View, factor: number, cx: number, cy: number): View {
  const k = clampK(v.k * factor);
  const r = k / v.k;
  return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
}

/** Zooms to an absolute scale around (cx, cy). */
export const zoomTo = (v: View, k: number, cx: number, cy: number): View => zoomAt(v, clampK(k) / v.k, cx, cy);

export const panBy = (v: View, dx: number, dy: number): View => ({ k: v.k, x: v.x + dx, y: v.y + dy });

/** Zoom factor for one ctrl+wheel (or pinch) event: small pinch deltas zoom gently, a mouse notch at most ~40%. */
export const wheelZoomFactor = (deltaY: number) => Math.exp(-clamp(deltaY, -50, 50) * 0.01);

/** "NN%" for the zoom readout. */
export const pct = (k: number) => `${Math.round(k * 100)}%`;

/** The smallest rect holding all of them, or null for none. */
export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
