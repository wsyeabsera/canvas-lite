// Pure helpers for rendering one screen's html to a PNG in the browser, for the screen_image tool (src/screen-image.ts).
// The browser half is web/screen-shot-view.ts: the html is parsed and re-serialised as XHTML inside an SVG foreignObject, drawn to a canvas. No library, no scripts run;
// external images and fonts do not load inside an SVG image, so a shot shows the screen's own markup and inline styles.
export const SHOT_FRESH_MS = 20_000;
export const SHOT_SIDE_MAX = 1600;

/** A request older than this is a replay of the event log, not a live ask: ignore it. */
export const shotIsFresh = (eventTs: number, now: number): boolean => now - eventTs >= -5_000 && now - eventTs <= SHOT_FRESH_MS;

/** The pixel size and scale to draw a w x h screen: the longest side is capped at SHOT_SIDE_MAX. */
export function shotSize(w: number, h: number): { width: number; height: number; scale: number } {
  const scale = Math.min(1, SHOT_SIDE_MAX / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

/** The SVG text that draws well-formed XHTML at w x h. */
export const shotSvg = (xhtml: string, w: number, h: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="${w}" height="${h}">${xhtml}</foreignObject></svg>`;
