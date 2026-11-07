// Pure canvas logic for the watch page: no DOM. page.ts feeds it API JSON and events and draws what it returns.
import type { WatchRow } from "../cli/format.ts";
import { routeCanvas, type Route } from "./state.ts";
import { TRANSITIONS, type Transition } from "./links.ts";
import { parsePresenter, parseTour, type Presenter, type TourStep } from "./follow.ts";
import { parseScenarios, type Scenario } from "./watch.ts";

export type CanvasSummary = { id: string; name: string; screens: number; updated_at: number };
export type Screen = { id: string; name: string; width: number; height: number; x: number | null; y: number | null; updated_at: number; html: string };
/** `start_screen` (null: the first screen) and `transition` (the default of links without their own) are the canvas flow. */
export type CanvasDetail = { canvas: { id: string; name: string; screens: number; created_at: number; updated_at: number; start_screen: string | null; transition: Transition }; screens: Screen[]; tour: TourStep[]; presenter: Presenter | null; scenarios: Scenario[] };

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

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
  const a = api as { canvas?: any; screens?: unknown; tour?: unknown; presenter?: unknown; scenarios?: unknown } | null;
  const c = a?.canvas;
  if (!c || typeof c.id !== "string") return null;
  const screens: Screen[] = [];
  if (Array.isArray(a?.screens)) {
    for (const s of a.screens as any[]) {
      if (!s || typeof s.id !== "string") continue;
      const width = num(s.width), height = num(s.height);
      if (width <= 0 || height <= 0) continue;
      screens.push({ id: s.id, name: str(s.name, s.id), width, height, x: pos(s.x), y: pos(s.y), updated_at: num(s.updated_at), html: str(s.html) });
    }
  }
  return { canvas: { id: c.id, name: str(c.name, c.id), screens: screens.length, created_at: num(c.created_at), updated_at: num(c.updated_at), start_screen: typeof c.start_screen === "string" ? c.start_screen : null, transition: (TRANSITIONS as readonly string[]).includes(c.transition) ? c.transition : "none" }, screens, tour: parseTour(a?.tour), presenter: parsePresenter(a?.presenter), scenarios: parseScenarios(a?.scenarios) };
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

export type Nav = { index: number; total: number; prev: Screen | null; next: Screen | null; screen: Screen };

/** Position and neighbours of a screen; null when it is not in the list. */
export function prevNext(screens: Screen[], id: string): Nav | null {
  const i = screens.findIndex((s) => s.id === id);
  if (i < 0) return null;
  return { index: i + 1, total: screens.length, prev: screens[i - 1] ?? null, next: screens[i + 1] ?? null, screen: screens[i]! };
}

export type IframeSpec = { sandbox: ""; referrerpolicy: "no-referrer"; loading: "lazy"; title: string; width: number; height: number; srcdoc: string };

/** The only way screen html is shown: an empty sandbox (no scripts, forms or same-origin), html as srcdoc. */
export function iframeSpec(s: Pick<Screen, "name" | "width" | "height" | "html">): IframeSpec {
  return { sandbox: "", referrerpolicy: "no-referrer", loading: "lazy", title: s.name, width: s.width, height: s.height, srcdoc: s.html };
}

export type Pending = { name: string; width: number; height: number; at: number };
/** The placeholder pill text while Claude writes screens, or null when it writes none. */
export function writingText(pending: ReadonlyMap<string, Pending>): string | null {
  if (pending.size === 0) return null;
  if (pending.size > 1) return `Claude is writing ${pending.size} screens…`;
  return `Claude is writing ${[...pending.values()][0]!.name}…`;
}

/** The screen ArrowLeft (-1) or ArrowRight (+1) selects: from none the first or last, at an end it stays. Null for no screens. */
export function stepScreen(screens: Screen[], current: string | null, dir: 1 | -1): string | null {
  if (screens.length === 0) return null;
  const n = current ? prevNext(screens, current) : null;
  if (!n) return (dir === 1 ? screens[0]! : screens[screens.length - 1]!).id;
  return (dir === 1 ? n.next : n.prev)?.id ?? current;
}

export type Shown = { updated_at: number; html: string };
export type ScreenDiff = { add: string[]; changed: string[]; html: string[]; remove: string[] };

/** What a refetch changes among the frames on screen: new ids, ids whose updated_at moved, ids whose html differs (only those reload), ids gone. */
export function diffScreens(shown: ReadonlyMap<string, Shown>, next: Screen[]): ScreenDiff {
  const d: ScreenDiff = { add: [], changed: [], html: [], remove: [] };
  const ids = new Set<string>();
  for (const s of next) {
    ids.add(s.id);
    const was = shown.get(s.id);
    if (!was) d.add.push(s.id);
    else {
      if (was.updated_at !== s.updated_at) d.changed.push(s.id);
      if (was.html !== s.html) d.html.push(s.id);
    }
  }
  for (const id of shown.keys()) if (!ids.has(id)) d.remove.push(id);
  return d;
}

export const CANVAS_KINDS = ["canvas.created", "screen.set", "screen.removed", "canvas.removed", "flow.set", "tour.set", "scenarios.set"];

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
  if (!ev || route.view === "activity" || route.view === "landing" || row.project !== route.id) return none;
  const here = routeCanvas(route) === ev.canvas;
  return { list: true, detail: here };
}

/** A removed canvas leaves the list at once. */
export const dropCanvas = (list: CanvasSummary[], id: string): CanvasSummary[] => list.filter((c) => c.id !== id);
