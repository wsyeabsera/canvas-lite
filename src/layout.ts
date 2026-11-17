// Where each screen sits on the canvas, in world px: pure, no DOM. Shared by the watch page (web/layout.ts) and
// read_canvas (src/canvases.ts), so the answer Claude gets is the position the page draws.
export const GAP = 160;
export const PER_ROW = 3;

/** Screens per row: 3 up to 9 screens, then wider so a large canvas stays about as wide as it is tall (a 25-screen canvas is 7 across, not a 9-row tower). */
export const columnsFor = (n: number) => (n <= 9 ? PER_ROW : Math.ceil(Math.sqrt(n * 1.5)));

export type Rect = { x: number; y: number; w: number; h: number };
export type Placeable = { id: string; width: number; height: number; x: number | null; y: number | null };
export type Box = Rect & { id: string };

/** A screen with x and y keeps them; the others fill rows of `columnsFor` screens from 0,0, GAP apart, each row as tall as its tallest. Input order is kept. */
export function layoutScreens(screens: Placeable[]): Box[] {
  const out: Box[] = [];
  const perRow = columnsFor(screens.filter((s) => s.x === null || s.y === null).length);
  let col = 0, cx = 0, rowY = 0, rowH = 0;
  for (const s of screens) {
    if (s.x !== null && s.y !== null) {
      out.push({ id: s.id, x: s.x, y: s.y, w: s.width, h: s.height });
      continue;
    }
    if (col === perRow) {
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
