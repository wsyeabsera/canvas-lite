// Pure logic of the landing page (the designer's gallery at `#/`): no DOM. landing-view.ts draws what these return.
// Entries come from `GET /api/projects/<id>/canvases` (docs/api.md): start_screen, dangling and unlinked are computed server-side.
import { agoText, screensLabel } from "./canvas.ts";
import { validId } from "./state.ts";

export type Entry = {
  pid: string;
  project: string; // project display name
  id: string;
  name: string;
  screens: number;
  updated_at: number;
  start_screen: string | null;
  dangling: number; // links to screens that do not exist
  unlinked: number; // controls that go nowhere
  /** Set on 3D scene cards (from `GET /api/projects/<id>/scenes`); absent on designs (canvases). */
  /** The canvas this one was forked from (a variant); the gallery stacks variants under their base. */
  forked_from?: string | null;
  variants?: number; // on a base: how many variants it has
  kind?: "scene";
  films?: number; // scenes: number of films
  drawables?: number; // scenes: objects after repeaters expand
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

export const isScene = (e: Pick<Entry, "kind">) => e.kind === "scene";

/** Shapes a scene list answer (`{scenes: [{id, name, objects, drawables, films, updated_at}]}`) into gallery entries of one project.
 *  A scene has no screens and no links: it always counts as Playable and never as Needs links. */
export function describeSceneEntries(pid: string, project: string, api: unknown): Entry[] {
  const raw = (api as { scenes?: unknown } | null)?.scenes;
  if (!Array.isArray(raw)) return [];
  const out: Entry[] = [];
  for (const c of raw) {
    if (!c || typeof c.id !== "string") continue;
    out.push({
      pid, project, id: c.id, name: typeof c.name === "string" && c.name ? c.name : c.id, screens: 0, updated_at: num(c.updated_at),
      start_screen: null, dangling: 0, unlinked: 0, kind: "scene", films: num(c.films), drawables: num(c.drawables),
    });
  }
  return out;
}

/** The chips of a scene card: `N films` (when it has any) and `Page` once its detail shows a page. */
export function sceneChips(e: Pick<Entry, "films">, hasPage: boolean): string[] {
  const n = e.films ?? 0;
  const out = n > 0 ? [`${n} film${n === 1 ? "" : "s"}`] : [];
  if (hasPage) out.push("Page");
  return out;
}

/** The hover buttons of a scene card, in order: Watch (only with films), Page (only with a page), Orbit (always). */
export function sceneActions(e: Pick<Entry, "pid" | "id" | "films">, hasPage: boolean): { label: "Watch" | "Page" | "Orbit"; href: string }[] {
  const base = `#/project/${e.pid}/scene/${e.id}`; // the scene routes of web/state.ts: Orbit, `/page`, and `/watch` (film player)
  const out: { label: "Watch" | "Page" | "Orbit"; href: string }[] = [];
  if ((e.films ?? 0) > 0) out.push({ label: "Watch", href: `${base}/watch` });
  if (hasPage) out.push({ label: "Page", href: `${base}/page` });
  out.push({ label: "Orbit", href: base });
  return out;
}

/** The local storage key of a scene's still poster; the Orbit view (web/scene-view.ts) writes the same key. */
export const scenePosterKey = (project: string, scene: string) => `lite.scene.poster.${project}/${scene}`;
/** The scene version (`updated_at`) a poster written by the landing page was drawn from. */
export const scenePosterAtKey = (project: string, scene: string) => `lite.scene.posterAt.${project}/${scene}`;

/** Whether a cached poster can be shown for a scene version: a poster without a stamp (written by Orbit) is accepted; a stamped one must not be older. */
export function posterFresh(poster: string | null | undefined, stamp: string | null | undefined, updatedAt: number): boolean {
  if (!poster) return false;
  if (stamp === null || stamp === undefined || stamp === "") return true;
  const n = Number(stamp);
  return Number.isFinite(n) && n >= updatedAt;
}

/** At most this many scene posters are rendered at the same time. */
export const POSTER_CONCURRENCY = 2;

/** Shapes a canvas list answer into entries of one project; tolerant of gaps (older servers send no link counts: 0). */
export function describeEntries(pid: string, project: string, api: unknown): Entry[] {
  const raw = (api as { canvases?: unknown } | null)?.canvases;
  if (!Array.isArray(raw)) return [];
  const out: Entry[] = [];
  for (const c of raw) {
    if (!c || typeof c.id !== "string") continue;
    out.push({
      pid, project, id: c.id, name: typeof c.name === "string" && c.name ? c.name : c.id, screens: num(c.screens), updated_at: num(c.updated_at),
      start_screen: typeof c.start_screen === "string" ? c.start_screen : null, dangling: num(c.dangling), unlinked: num(c.unlinked),
      forked_from: typeof c.forked_from === "string" ? c.forked_from : null,
    });
  }
  return out;
}

/** The gallery list: a variant is hidden when its base is in the list, and the base carries the count. A variant whose base is gone stays visible. */
export function stackVariants(entries: readonly Entry[]): Entry[] {
  const ids = new Set(entries.filter((e) => !isScene(e)).map((e) => `${e.pid}/${e.id}`));
  const count = new Map<string, number>();
  for (const e of entries) if (e.forked_from && ids.has(`${e.pid}/${e.forked_from}`)) count.set(`${e.pid}/${e.forked_from}`, (count.get(`${e.pid}/${e.forked_from}`) ?? 0) + 1);
  return entries.filter((e) => !(e.forked_from && ids.has(`${e.pid}/${e.forked_from}`))).map((e) => (count.has(`${e.pid}/${e.id}`) ? { ...e, variants: count.get(`${e.pid}/${e.id}`) } : e));
}

export const missingLinks = (e: Pick<Entry, "dangling" | "unlinked">) => e.dangling + e.unlinked;
/** Playable: at least one screen and every link and control is wired. An empty canvas is neither playable nor missing links. */
export const isPlayable = (e: Pick<Entry, "screens" | "dangling" | "unlinked" | "kind">) => e.kind === "scene" || (e.screens > 0 && missingLinks(e) === 0);
export const needsLinks = (e: Pick<Entry, "dangling" | "unlinked" | "kind">) => e.kind !== "scene" && missingLinks(e) > 0;

export type Badge = { kind: "playable" | "missing" | "empty"; text: string };
export function badgeOf(e: Pick<Entry, "screens" | "dangling" | "unlinked" | "kind">): Badge {
  if (e.kind === "scene") return { kind: "playable", text: "3D scene" };
  const n = missingLinks(e);
  if (n > 0) return { kind: "missing", text: `${n} missing link${n === 1 ? "" : "s"}` };
  if (e.screens === 0) return { kind: "empty", text: "No screens" };
  return { kind: "playable", text: "Playable" };
}

export type Filter = "all" | "playable" | "needs";
export const FILTERS: readonly Filter[] = ["all", "playable", "needs"];
export const FILTER_LABEL: Record<Filter, string> = { all: "All", playable: "Playable", needs: "Needs links" };

export function filterCounts(entries: readonly Entry[]): Record<Filter, number> {
  return { all: entries.length, playable: entries.filter(isPlayable).length, needs: entries.filter(needsLinks).length };
}

export function applyFilter(entries: readonly Entry[], f: Filter): Entry[] {
  return entries.filter(f === "playable" ? isPlayable : f === "needs" ? needsLinks : () => true);
}

/** Every word of the query must appear in the design or scene name (case-insensitive; scenes also match "3d" and "scene"). Empty query keeps all. */
export function searchEntries(entries: readonly Entry[], query: string): Entry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries.slice();
  return entries.filter((e) => {
    const hay = `${e.name}${e.kind === "scene" ? " 3d scene" : ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The flat gallery order: most recently updated first, then name, then project and id so the order is stable. */
export function sortEntries(entries: readonly Entry[]): Entry[] {
  return entries.slice().sort((a, b) => b.updated_at - a.updated_at || a.name.localeCompare(b.name) || a.pid.localeCompare(b.pid) || a.id.localeCompare(b.id));
}

// --- project switcher: the page shows one project at a time ---------------------------------------

export const PROJECT_KEY = "lite.project";
export type ProjectItem = { id: string; name: string; meta: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** `8 designs · 3 scenes` (scenes only when there are some); the heading under the project name. */
export function projectSummary(entries: readonly Entry[]): string {
  const scenes = entries.filter(isScene).length;
  return plural(entries.length - scenes, "design") + (scenes ? ` · ${plural(scenes, "scene")}` : "");
}

/** Every project Lite knows (also the empty ones), in the order given, each with its summary or `empty`. */
export function projectItems(projects: readonly { id: string; name: string }[], entries: readonly Entry[]): ProjectItem[] {
  return projects.map((p) => {
    const mine = filterByProject(entries, p.id);
    return { id: p.id, name: p.name, meta: mine.length ? projectSummary(mine) : "empty" };
  });
}

/** The saved choice if that project still exists, else the first project; "" when there is none. */
export const resolveProject = (saved: string | null | undefined, items: readonly ProjectItem[]) => (items.find((p) => p.id === saved) ?? items[0])?.id ?? "";

/** Keeps only the designs and scenes of one project. */
export const filterByProject = (entries: readonly Entry[], pid: string): Entry[] => entries.filter((e) => e.pid === pid);

/** `12 screens · updated 1 h ago`; a scene: `28 objects · updated 1 h ago` (objects after repeaters expand). */
export const metaLine = (e: Pick<Entry, "screens" | "updated_at" | "kind" | "drawables">, now: number) =>
  `${e.kind === "scene" ? `${e.drawables ?? 0} object${e.drawables === 1 ? "" : "s"}` : screensLabel(e.screens)} · updated ${agoText(e.updated_at, now)}`;

/** Scale and offset that fit a `w` x `h` screen inside a `bw` x `bh` box (contain, centred); the iframe is `w` x `h`, scaled with a CSS transform from the top left. */
export function thumbFit(w: number, h: number, bw: number, bh: number): { scale: number; left: number; top: number } {
  if (!(w > 0) || !(h > 0) || !(bw > 0) || !(bh > 0)) return { scale: 1, left: 0, top: 0 };
  const scale = Math.min(bw / w, bh / h);
  return { scale, left: (bw - w * scale) / 2, top: (bh - h * scale) / 2 };
}

/** The screen the thumbnail shows: the start screen if it exists, else the first. Null for no screens. */
export function startScreenOf<T extends { id: string }>(screens: readonly T[], start: string | null): T | null {
  return screens.find((s) => s.id === start) ?? screens[0] ?? null;
}

// --- last opened (localStorage) -----------------------------------------------------------------

export const LAST_KEY = "lite.last";
export type Last = { project: string; canvas: string; screen: string | null; ts: number };

export function parseLast(raw: string | null | undefined): Last | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Last> | null;
    if (!v || typeof v.project !== "string" || typeof v.canvas !== "string" || !validId(v.project) || !validId(v.canvas)) return null;
    const screen = typeof v.screen === "string" && validId(v.screen) ? v.screen : null;
    return { project: v.project, canvas: v.canvas, screen, ts: typeof v.ts === "number" && Number.isFinite(v.ts) ? v.ts : 0 };
  } catch {
    return null;
  }
}

type OpenedRoute = { view: string; id?: string; canvas?: string; screen?: string | null };

/** What opening a route does to the remembered "last opened": canvas, screen and play views remember the canvas (play and screen also the screen);
 *  the same canvas keeps its screen when only the canvas view is opened; any other route changes nothing. */
export function rememberRoute(prev: Last | null, route: OpenedRoute, now: number): Last | null {
  if (!route.id || !route.canvas) return prev;
  if (route.view === "play" || route.view === "screen") return { project: route.id, canvas: route.canvas, screen: route.screen ?? null, ts: now };
  if (route.view === "canvas" || route.view === "walk") {
    const keep = prev && prev.project === route.id && prev.canvas === route.canvas ? prev.screen : null;
    return { project: route.id, canvas: route.canvas, screen: keep, ts: now };
  }
  return prev;
}

/** Play moved to a screen of the canvas it is on. */
export const rememberScreen = (project: string, canvas: string, screen: string, now: number): Last => ({ project, canvas, screen, ts: now });

export type Continue = { entry: Entry; text: string };

/** The Continue strip: the entry of the last-opened canvas (null when it no longer exists) and `12 screens · you stopped at X · 5 min ago`. */
export function continueModel(last: Last | null, entries: readonly Entry[], screenName: (screenId: string) => string | null, now: number): Continue | null {
  if (!last) return null;
  const entry = entries.find((e) => !isScene(e) && e.pid === last.project && e.id === last.canvas);
  if (!entry) return null;
  const parts = [screensLabel(entry.screens)];
  if (last.screen) parts.push(`you stopped at ${screenName(last.screen) ?? last.screen}`);
  parts.push(agoText(last.ts, now));
  return { entry, text: parts.join(" · ") };
}

// --- Claude presenting banner ---------------------------------------------------------------------

export type Session = { active: boolean; canvas: string; screen: string; visited: string[]; ts: number };
export type Sessions = Record<string, Session>; // by project id

/** Folds one `presenter.*` event of any project into the sessions. Returns the same object when the row changes nothing. */
export function foldSession(s: Sessions, row: { kind: string; project: string | null; payload?: unknown; ts: number }): Sessions {
  if (!row.project || !row.kind.startsWith("presenter.")) return s;
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const cur = s[row.project];
  if (row.kind === "presenter.started" || row.kind === "presenter.goto") {
    if (typeof p.canvas !== "string" || typeof p.screen !== "string") return s;
    const started = row.kind === "presenter.started" || !cur || cur.canvas !== p.canvas;
    const base = started ? [] : cur.visited;
    const visited = base.includes(p.screen) ? base : [...base, p.screen];
    return { ...s, [row.project]: { active: true, canvas: p.canvas, screen: p.screen, visited, ts: row.ts } };
  }
  if (row.kind === "presenter.stopped") return cur ? { ...s, [row.project]: { ...cur, active: false, ts: row.ts } } : s;
  return s;
}

export type Banner = { pid: string; canvas: string; text: string; name: string };

/** The banner for the most recently moved active session whose canvas is known: `<canvas name>, step n of m`, else null. */
export function bannerModel(s: Sessions, entries: readonly Entry[]): Banner | null {
  let best: { pid: string; sess: Session; entry: Entry } | null = null;
  for (const [pid, sess] of Object.entries(s)) {
    if (!sess.active) continue;
    const entry = entries.find((e) => !isScene(e) && e.pid === pid && e.id === sess.canvas);
    if (!entry) continue;
    if (!best || sess.ts > best.sess.ts) best = { pid, sess, entry };
  }
  if (!best) return null;
  const i = best.sess.visited.indexOf(best.sess.screen);
  const n = i >= 0 ? i + 1 : best.sess.visited.length;
  const m = Math.max(best.entry.screens, n);
  return { pid: best.pid, canvas: best.entry.id, name: best.entry.name, text: `${best.entry.name}, step ${n} of ${m}` };
}
