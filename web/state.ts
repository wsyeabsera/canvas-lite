// Pure page state: no DOM. page.ts feeds it rows and API results and draws what it returns.
import type { WatchRow } from "../cli/format.ts";

export const MAX_ROWS = 500;
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export type ProjectInfo = { id: string; name: string; kind: string; repo: string | null; files: number };
export type State = {
  rows: WatchRow[]; // ordered by seq, at most MAX_ROWS (the newest)
  projects: Record<string, ProjectInfo>;
  counts: Record<string, number>; // events seen per project id (not capped)
  total: number; // events seen
};
export type Route =
  | { view: "landing" } // `#/`: the designer's gallery (web/landing.ts)
  | { view: "activity" } // `#/activity` (and any unreadable hash)
  | { view: "project"; id: string }
  | { view: "canvas"; id: string; canvas: string }
  | { view: "screen"; id: string; canvas: string; screen: string }
  | { view: "walk"; id: string; canvas: string } // walkthrough mode of play: `#/project/<id>/canvas/<cid>/walk`
  | { view: "watch"; id: string; canvas: string; scenario: string | null } // scenario video player: `#/project/<id>/canvas/<cid>/watch[/<scenarioId>]` (null: the picker)
  | { view: "play"; id: string; canvas: string; screen: string | null } // present mode; `screen` = where to start (null: the start screen)
  | { view: "scene"; id: string; scene: string } // a 3D scene in Orbit mode: `#/project/<id>/scene/<sid>` (web/scene-view.ts)
  | { view: "scene-page"; id: string; scene: string } // the scene's scrolling page: `#/project/<id>/scene/<sid>/page` (web/scene-page-view.ts)
  | { view: "design"; id: string } // the project's design system: `#/project/<id>/design` (web/design-view.ts)
  | { view: "scene-watch"; id: string; scene: string; film: string | null }; // Watch mode: `#/project/<id>/scene/<sid>/watch[/<filmId>]` (null: the film picker; web/scene-watch-view.ts)

export const initialState = (): State => ({ rows: [], projects: {}, counts: {}, total: 0 });

/** Returns the same state object when the row is a duplicate (by seq). */
export function addRow(s: State, row: WatchRow): State {
  if (s.rows.some((r) => r.seq === row.seq)) return s;
  const next = s.rows.slice();
  let i = next.length;
  while (i > 0 && next[i - 1].seq > row.seq) i--;
  next.splice(i, 0, row);
  while (next.length > MAX_ROWS) next.shift();
  const counts = { ...s.counts };
  if (row.project) counts[row.project] = (counts[row.project] ?? 0) + 1;
  let projects = s.projects;
  if (row.kind === "project.opened" && row.project) {
    const p = row.payload as Record<string, unknown> | null;
    projects = {
      ...projects,
      [row.project]: {
        id: row.project,
        name: typeof p?.name === "string" ? p.name : row.project,
        kind: typeof p?.kind === "string" ? p.kind : "",
        repo: typeof p?.repo === "string" ? p.repo : null,
        files: typeof p?.files === "number" ? p.files : 0,
      },
    };
  }
  if (row.kind === "project.removed" && row.project && projects[row.project]) {
    projects = { ...projects };
    delete projects[row.project];
  }
  return { rows: next, projects, counts, total: s.total + 1 };
}

export const validId = (id: string) => id.length <= 40 && ID_RE.test(id);

/** `#/`, `#/project/<id>`, `#/project/<id>/canvas/<cid>`, `.../screen/<sid>` or `.../play[/<sid>]`; anything else (or any id that is not a slug) is the activity view. */
export function parseRoute(hash: string): Route {
  if (hash === "" || hash === "#" || hash === "#/") return { view: "landing" };
  if (hash === "#/activity") return { view: "activity" };
  const ds = /^#\/project\/([^/?#]+)\/design$/.exec(hash);
  if (ds) return validId(ds[1]) ? { view: "design", id: ds[1] } : { view: "activity" };
  const sc = /^#\/project\/([^/?#]+)\/scene\/([^/?#]+)$/.exec(hash);
  if (sc) return validId(sc[1]) && validId(sc[2]) ? { view: "scene", id: sc[1], scene: sc[2] } : { view: "activity" };
  const sp = /^#\/project\/([^/?#]+)\/scene\/([^/?#]+)\/page$/.exec(hash);
  if (sp) return validId(sp[1]) && validId(sp[2]) ? { view: "scene-page", id: sp[1], scene: sp[2] } : { view: "activity" };
  const sw = /^#\/project\/([^/?#]+)\/scene\/([^/?#]+)\/watch(?:\/([^/?#]+))?$/.exec(hash);
  if (sw) return validId(sw[1]) && validId(sw[2]) && (sw[3] === undefined || validId(sw[3])) ? { view: "scene-watch", id: sw[1], scene: sw[2], film: sw[3] ?? null } : { view: "activity" };
  const vw = /^#\/project\/([^/?#]+)\/canvas\/([^/?#]+)\/watch(?:\/([^/?#]+))?$/.exec(hash);
  if (vw) return validId(vw[1]) && validId(vw[2]) && (vw[3] === undefined || validId(vw[3])) ? { view: "watch", id: vw[1], canvas: vw[2], scenario: vw[3] ?? null } : { view: "activity" };
  const w = /^#\/project\/([^/?#]+)\/canvas\/([^/?#]+)\/walk$/.exec(hash);
  if (w) return validId(w[1]) && validId(w[2]) ? { view: "walk", id: w[1], canvas: w[2] } : { view: "activity" };
  const p = /^#\/project\/([^/?#]+)\/canvas\/([^/?#]+)\/play(?:\/([^/?#]+))?$/.exec(hash);
  if (p) return validId(p[1]) && validId(p[2]) && (p[3] === undefined || validId(p[3])) ? { view: "play", id: p[1], canvas: p[2], screen: p[3] ?? null } : { view: "activity" };
  const m = /^#\/project\/([^/?#]+)(?:\/canvas\/([^/?#]+)(?:\/screen\/([^/?#]+))?)?$/.exec(hash);
  if (!m || !validId(m[1])) return { view: "activity" };
  if (m[2] === undefined) return { view: "project", id: m[1] };
  if (!validId(m[2])) return { view: "activity" };
  if (m[3] === undefined) return { view: "canvas", id: m[1], canvas: m[2] };
  if (!validId(m[3])) return { view: "activity" };
  return { view: "screen", id: m[1], canvas: m[2], screen: m[3] };
}

/** The project a route belongs to, or null for the landing and activity views. */
export const routeProject = (route: Route): string | null => (route.view === "activity" || route.view === "landing" ? null : route.id);

/** The canvas a route shows (canvas, screen or play), else null. */
export const routeCanvas = (route: Route): string | null => (route.view === "canvas" || route.view === "screen" || route.view === "play" || route.view === "walk" || route.view === "watch" ? route.canvas : null);

/** The scene a route shows (the scene route), else null. */
export const routeScene = (route: Route): string | null => (route.view === "scene" || route.view === "scene-page" || route.view === "scene-watch" ? route.scene : null);

/** True when an event changes the scene the route shows (`scene.set` or `films.set` for it; on the page route also `page.set`), so the view refetches it. */
export function sceneEventHits(route: Route, row: Pick<WatchRow, "project" | "kind" | "payload">): boolean {
  if ((route.view !== "scene" && route.view !== "scene-page" && route.view !== "scene-watch") || row.project !== route.id) return false;
  const kinds = route.view === "scene-page" ? ["scene.set", "films.set", "scene.removed", "page.set"] : ["scene.set", "films.set", "scene.removed"];
  if (!kinds.includes(row.kind)) return false;
  return (row.payload as { scene?: unknown } | null)?.scene === route.scene;
}

export const hrefLanding = "#/";
export const hrefDesign = (id: string) => `#/project/${id}/design`;
export const hrefScene = (id: string, scene: string) => `#/project/${id}/scene/${scene}`;
export const hrefScenePage = (id: string, scene: string) => `#/project/${id}/scene/${scene}/page`;
export const hrefSceneWatch = (id: string, scene: string, film?: string | null) => `#/project/${id}/scene/${scene}/watch${film ? `/${film}` : ""}`;
export const hrefActivity = "#/activity";
export const hrefWalk = (id: string, canvas: string) => `#/project/${id}/canvas/${canvas}/walk`;
export const hrefProject = (id: string) => `#/project/${id}`;
export const hrefCanvas = (id: string, canvas: string) => `#/project/${id}/canvas/${canvas}`;
export const hrefScreen = (id: string, canvas: string, screen: string) => `#/project/${id}/canvas/${canvas}/screen/${screen}`;

export function visibleRows(s: State, route: Route): WatchRow[] {
  return route.view === "activity" || route.view === "landing" ? s.rows : s.rows.filter((r) => r.project === route.id);
}

/** Sidebar order: by name, then id. */
export function sortedProjects(s: State): ProjectInfo[] {
  return Object.values(s.projects).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export type ProjectView = {
  title: string;
  kind: string;
  repo: string | null; // only http(s) URLs
  description: string; // first non-empty README line, or ""
  files: string[];
  rows: WatchRow[];
};

export const safeRepo = (url: unknown): string | null => (typeof url === "string" && /^https?:\/\//i.test(url) ? url : null);

/** First non-empty README line, heading marks removed, capped at 200 characters. */
export function readmeLine(readme: string | undefined): string {
  if (!readme) return "";
  for (const line of readme.split(/\r?\n/)) {
    const t = line.replace(/^\s*#+\s*/, "").trim();
    if (t) return t.length > 200 ? `${t.slice(0, 197)}...` : t;
  }
  return "";
}

/** Shapes the `/api/projects/<id>` JSON; tolerant of missing parts. */
export function describeProject(api: unknown): ProjectView {
  const a = (api ?? {}) as Record<string, any>;
  const p = a.project ?? {};
  const files: Record<string, string> = a.manifest?.files && typeof a.manifest.files === "object" ? a.manifest.files : {};
  const key = Object.keys(files).find((k) => k.toLowerCase() === "readme.md");
  return {
    title: typeof p.name === "string" ? p.name : String(p.id ?? ""),
    kind: typeof p.kind === "string" ? p.kind : "",
    repo: safeRepo(p.repo),
    description: key ? readmeLine(String(files[key])) : "",
    files: Array.isArray(a.manifest?.tree) ? a.manifest.tree.filter((x: unknown) => typeof x === "string") : [],
    rows: Array.isArray(a.events) ? a.events.filter((e: any) => e && typeof e.seq === "number") : [],
  };
}

export const hrefPlay = (id: string, canvas: string, screen?: string | null) => `#/project/${id}/canvas/${canvas}/play${screen ? `/${screen}` : ""}`;

export const hrefWatch = (id: string, canvas: string, scenario?: string | null) => `#/project/${id}/canvas/${canvas}/watch${scenario ? `/${scenario}` : ""}`;
