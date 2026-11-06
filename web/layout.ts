// Where each screen sits on the canvas, in world px: no DOM.
import type { Rect } from "./viewport.ts";

export const GAP = 160;
export const PER_ROW = 3;

export type Placeable = { id: string; width: number; height: number; x: number | null; y: number | null };
export type Box = Rect & { id: string };

/** A screen with x and y keeps them; the others fill rows of PER_ROW from 0,0, GAP apart, each row as tall as its tallest. Input order is kept. */
export function layoutScreens(screens: Placeable[]): Box[] {
  const out: Box[] = [];
  let col = 0, cx = 0, rowY = 0, rowH = 0;
  for (const s of screens) {
    if (s.x !== null && s.y !== null) {
      out.push({ id: s.id, x: s.x, y: s.y, w: s.width, h: s.height });
      continue;
    }
    if (col === PER_ROW) {
      rowY += rowH + GAP;
      col = 0;
      cx = 0;
      rowH = 0;
    }
    out.push({ id: s.id, x: cx, y: rowY, w: s.width, h: s.height });
    cx += s.width + GAP;
    rowH = Math.max(rowH, s.height);
    col++;
  }
  return out;
}
