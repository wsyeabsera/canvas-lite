// Pure canvas logic for the watch page: no DOM. page.ts feeds it API JSON and events and draws what it returns.
import type { WatchRow } from "../cli/format.ts";
import type { Route } from "./state.ts";

export type CanvasSummary = { id: string; name: string; screens: number; updated_at: number };
export type Screen = { id: string; name: string; width: number; height: number; updated_at: number; html: string };
export type CanvasDetail = { canvas: { id: string; name: string; screens: number; created_at: number; updated_at: number }; screens: Screen[] };

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

/** Most recently updated first, then by name. */
export function sortCanvases(list: CanvasSummary[]): CanvasSummary[] {
  return list.slice().sort((a, b) => b.updated_at - a.updated_at || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Shapes `GET /api/projects/<id>/canvases`; tolerant of gaps. */
export function describeCanvasList(api: unknown): CanvasSummary[] {
  const raw = (api as { canvases?: unknown } | null)?.canvases;
  if (!Array.isArray(raw)) return [];
  const out: CanvasSummary[] = [];
  for (const c of raw) {
    if (!c || typeof c.id !== "string") continue;
    out.push({ id: c.id, name: str(c.name, c.id), screens: num(c.screens), updated_at: num(c.updated_at) });
  }
  return sortCanvases(out);
}

/** Shapes `GET /api/projects/<id>/canvases/<cid>`; screens keep the API order. Null when there is no canvas in it. */
export function describeCanvasDetail(api: unknown): CanvasDetail | null {
  const a = api as { canvas?: any; screens?: unknown } | null;
  const c = a?.canvas;
  if (!c || typeof c.id !== "string") return null;
  const screens: Screen[] = [];
  if (Array.isArray(a?.screens)) {
    for (const s of a.screens as any[]) {
      if (!s || typeof s.id !== "string") continue;
      const width = num(s.width), height = num(s.height);
      if (width <= 0 || height <= 0) continue;
      screens.push({ id: s.id, name: str(s.name, s.id), width, height, updated_at: num(s.updated_at), html: str(s.html) });
    }
  }
  return { canvas: { id: c.id, name: str(c.name, c.id), screens: screens.length, created_at: num(c.created_at), updated_at: num(c.updated_at) }, screens };
}

/** "just now", "2 min ago", "3 h ago", "yesterday", "5 days ago". `now` is injected. */
export function agoText(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export const screensLabel = (n: number) => (n === 0 ? "no screens" : n === 1 ? "1 screen" : `${n} screens`);

/** "5 screens · updated 2 min ago", or "no screens · created just now" for an empty canvas. */
export function canvasMeta(d: CanvasDetail, now: number): string {
  return d.screens.length === 0 ? `no screens · created ${agoText(d.canvas.created_at, now)}` : `${screensLabel(d.screens.length)} · updated ${agoText(d.canvas.updated_at, now)}`;
}

/** The id of the most recently updated screen (the later one in order on a tie), or null. */
export function newestScreenId(screens: Screen[]): string | null {
  let best: Screen | null = null;
  for (const s of screens) if (!best || s.updated_at >= best.updated_at) best = s;
  return best ? best.id : null;
}

export type Nav = { index: number; total: number; prev: Screen | null; next: Screen | null; screen: Screen };

/** Position and neighbours of a screen; null when it is not in the list. */
export function prevNext(screens: Screen[], id: string): Nav | null {
  const i = screens.findIndex((s) => s.id === id);
  if (i < 0) return null;
  return { index: i + 1, total: screens.length, prev: screens[i - 1] ?? null, next: screens[i + 1] ?? null, screen: screens[i]! };
}

/** Scale and offset that fit a w x h screen inside a box, centred, never distorted. */
export function fitScale(boxW: number, boxH: number, w: number, h: number): { scale: number; left: number; top: number } {
  if (!(boxW > 0) || !(boxH > 0) || !(w > 0) || !(h > 0)) return { scale: 1, left: 0, top: 0 };
  const scale = Math.min(boxW / w, boxH / h);
  return { scale, left: (boxW - w * scale) / 2, top: (boxH - h * scale) / 2 };
}

/** Size of the focused preview: as large as fits `avail` px wide (capped at `maxW`) and `maxH` tall, aspect kept. */
export function focusSize(avail: number, maxH: number, w: number, h: number, maxW = 960): { width: number; height: number; scale: number } {
  if (!(avail > 0) || !(maxH > 0) || !(w > 0) || !(h > 0)) return { width: 0, height: 0, scale: 1 };
  const scale = Math.min(Math.min(avail, maxW) / w, maxH / h);
  return { width: w * scale, height: h * scale, scale };
}

export type IframeSpec = { sandbox: ""; referrerpolicy: "no-referrer"; loading: "lazy"; title: string; width: number; height: number; srcdoc: string };

/** The only way screen html is shown: an empty sandbox (no scripts, forms or same-origin), html as srcdoc. */
export function iframeSpec(s: Pick<Screen, "name" | "width" | "height" | "html">): IframeSpec {
  return { sandbox: "", referrerpolicy: "no-referrer", loading: "lazy", title: s.name, width: s.width, height: s.height, srcdoc: s.html };
}

export type Pending = { name: string; width: number; height: number; at: number };
export type Tile = { kind: "screen"; screen: Screen } | { kind: "writing"; id: string; name: string; width: number; height: number };

/** Grid tiles: screens in order, a screen being rewritten shown as a placeholder in its place, new ones appended. */
export function mergeTiles(screens: Screen[], pending: ReadonlyMap<string, Pending>): Tile[] {
  const tiles: Tile[] = screens.map((s) => {
    const p = pending.get(s.id);
    return p ? { kind: "writing", id: s.id, name: p.name, width: p.width, height: p.height } : { kind: "screen", screen: s };
  });
  const have = new Set(screens.map((s) => s.id));
  for (const [id, p] of pending) if (!have.has(id)) tiles.push({ kind: "writing", id, name: p.name, width: p.width, height: p.height });
  return tiles;
}

export const CANVAS_KINDS = ["canvas.created", "screen.set", "screen.removed", "canvas.removed"];

/** Event payload fields the page reads: canvas id, screen id, name. */
export function canvasEvent(row: Pick<WatchRow, "kind" | "payload">): { kind: string; canvas: string; id: string | null; name: string; width: number; height: number } | null {
  if (!CANVAS_KINDS.includes(row.kind)) return null;
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const canvas = str(p.canvas);
  if (!canvas) return null;
  return { kind: row.kind, canvas, id: typeof p.id === "string" ? p.id : null, name: str(p.name, typeof p.id === "string" ? p.id : canvas), width: num(p.width, 1920), height: num(p.height, 1080) };
}

/** What a canvas event makes the page refetch on the current route. Events of other projects change nothing. */
export function refetchPlan(route: Route, row: Pick<WatchRow, "kind" | "project" | "payload">): { list: boolean; detail: boolean } {
  const none = { list: false, detail: false };
  const ev = canvasEvent(row);
  if (!ev || route.view === "activity" || row.project !== route.id) return none;
  const here = (route.view === "canvas" || route.view === "screen") && route.canvas === ev.canvas;
  return { list: true, detail: here };
}

/** A removed canvas leaves the list at once. */
export const dropCanvas = (list: CanvasSummary[], id: string): CanvasSummary[] => list.filter((c) => c.id !== id);
