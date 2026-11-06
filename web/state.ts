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
  | { view: "activity" }
  | { view: "project"; id: string }
  | { view: "canvas"; id: string; canvas: string }
  | { view: "screen"; id: string; canvas: string; screen: string }
  | { view: "walk"; id: string; canvas: string } // walkthrough mode of play: `#/project/<id>/canvas/<cid>/walk`
  | { view: "play"; id: string; canvas: string; screen: string | null }; // present mode; `screen` = where to start (null: the start screen)

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

/** The project a route belongs to, or null for the activity view. */
export const routeProject = (route: Route): string | null => (route.view === "activity" ? null : route.id);

/** The canvas a route shows (canvas, screen or play), else null. */
export const routeCanvas = (route: Route): string | null => (route.view === "canvas" || route.view === "screen" || route.view === "play" || route.view === "walk" ? route.canvas : null);

export const hrefProject = (id: string) => `#/project/${id}`;
export const hrefCanvas = (id: string, canvas: string) => `#/project/${id}/canvas/${canvas}`;
export const hrefScreen = (id: string, canvas: string, screen: string) => `#/project/${id}/canvas/${canvas}/screen/${screen}`;

export function visibleRows(s: State, route: Route): WatchRow[] {
  return route.view === "activity" ? s.rows : s.rows.filter((r) => r.project === route.id);
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
export const hrefWalk = (id: string, canvas: string) => `#/project/${id}/canvas/${canvas}/walk`;
