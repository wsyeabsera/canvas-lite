// Canvases and screens as pure functions over `Sql` (docs/canvas.md). Every change appends its event in the same
// transaction and returns it for the Hub to broadcast. Events never carry html.
import { appendEvent, type LiteEvent, type Sql } from "./store.ts";
import { slugify } from "./projects.ts";

export const SCREEN_HTML_LIMIT = 200_000;
export const SCREENS_PER_CANVAS = 50;
export const CANVASES_PER_PROJECT = 20;
export const MIN_SIZE = 100;
export const MAX_SIZE = 8000;

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** Tool texts, built from the limits so the guidance never drifts from the checks. Pure, so unit tests read it. */
export const CANVAS_TEXT = {
  create_canvas: `Create a canvas in a project: a named board that holds screens (UI designs) the watch page shows live. Idempotent by id: creating an existing canvas changes nothing; creating a removed one brings it back. At most ${CANVASES_PER_PROJECT} canvases per project (error "too many canvases: limit ${CANVASES_PER_PROJECT}").`,
  list_canvases: `List a project's canvases (id, name, screen count, updated_at), removed ones hidden.`,
  read_canvas: `Return a canvas and its screens (id, name, width, height, x, y, updated_at). The html of each screen is left out unless include_html is true; ask for it only when you need to edit a screen's markup.`,
  set_screen:
    `Create or replace one screen on a canvas (upsert by id; id defaults to the slug of name, and replacing keeps the screen's place in the order). ` +
    `html is ONE self-contained HTML document per screen: inline CSS, no scripts. Images may be https URLs or data: URIs; nothing else is loaded (no fonts or stylesheets from other origins, no fetch). ` +
    `Size the root element to width x height CSS pixels (width and height are integers from ${MIN_SIZE} to ${MAX_SIZE}). ` +
    `html is at most ${SCREEN_HTML_LIMIT} bytes (error "screen too large: <n> bytes, limit ${SCREEN_HTML_LIMIT}"); at most ${SCREENS_PER_CANVAS} screens per canvas (error "too many screens: limit ${SCREENS_PER_CANVAS}"). ` +
    `x and y (integers) place the screen on the canvas; leave them out for automatic layout.`,
  remove_screen: `Remove a screen from a canvas. Removing a screen that is already gone does nothing.`,
  remove_canvas: `Archive a canvas and its screens from view: it disappears from list_canvases and the watch page, and a canvas.removed event is recorded. Removing an already removed canvas does nothing; create_canvas with the same id brings it back.`,
};

export type CanvasSummary = { id: string; name: string; screens: number; created_at: number; updated_at: number };
export type ScreenSummary = { id: string; name: string; width: number; height: number; x: number | null; y: number | null; updated_at: number };
export type ScreenInput = { canvas: string; name: string; width: number; height: number; html: string; id?: string; x?: number; y?: number };

type CanvasRow = { id: string; name: string; created_at: number; updated_at: number; archived_at: number | null; screens: number };
const CANVAS_SELECT =
  "SELECT c.id, c.name, c.created_at, c.updated_at, c.archived_at, (SELECT count(*) FROM screens s WHERE s.project = c.project AND s.canvas = c.id) AS screens FROM canvases c";
const canvasSummary = (r: CanvasRow): CanvasSummary => ({ id: r.id, name: r.name, screens: r.screens, created_at: r.created_at, updated_at: r.updated_at });

function requireProject(sql: Sql, project: string): void {
  const [p] = sql.all<{ archived_at: number | null }>("SELECT archived_at FROM projects WHERE id = ?", project);
  if (!p || p.archived_at !== null) throw new Error(`unknown project "${project}"`);
}

function checkName(name: unknown): string {
  if (typeof name !== "string" || name.trim() === "" || name.length > 100) throw new Error("invalid name: use 1 to 100 characters");
  return name;
}

function checkId(kind: "canvas" | "screen", id: unknown): string {
  if (typeof id !== "string" || id.length > 40 || !ID_RE.test(id))
    throw new Error(`invalid ${kind} id "${String(id)}": use lowercase letters, digits and -, at most 40`);
  return id;
}

/** The live (not removed) canvas row, else `unknown canvas`. */
function requireCanvas(sql: Sql, project: string, canvas: string): CanvasRow {
  checkId("canvas", canvas);
  const [c] = sql.all<CanvasRow>(`${CANVAS_SELECT} WHERE c.project = ? AND c.id = ?`, project, canvas);
  if (!c || c.archived_at !== null) throw new Error(`unknown canvas "${canvas}"`);
  return c;
}

const liveCount = (sql: Sql, project: string) =>
  sql.all<{ n: number }>("SELECT count(*) AS n FROM canvases WHERE project = ? AND archived_at IS NULL", project)[0].n;

/** Idempotent by id. New: row + `canvas.created`. Existing: nothing, no event. Removed: un-archived + the event again. */
export function createCanvas(
  sql: Sql, project: string, input: { name: string; id?: string }, now = Date.now(),
): { canvas: CanvasSummary; event: LiteEvent | null } {
  requireProject(sql, project);
  const name = checkName(input?.name);
  const id = checkId("canvas", input.id ?? slugify(name));
  return sql.transaction(() => {
    const [c] = sql.all<CanvasRow>(`${CANVAS_SELECT} WHERE c.project = ? AND c.id = ?`, project, id);
    if (c && c.archived_at === null) return { canvas: canvasSummary(c), event: null };
    if (liveCount(sql, project) >= CANVASES_PER_PROJECT) throw new Error(`too many canvases: limit ${CANVASES_PER_PROJECT}`);
    if (c) sql.run("UPDATE canvases SET name = ?, archived_at = NULL, updated_at = ? WHERE project = ? AND id = ?", name, now, project, id);
    else sql.run("INSERT INTO canvases (project, id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", project, id, name, now, now);
    const event = appendEvent(sql, { project, kind: "canvas.created", payload: { canvas: id, name } }, now);
    return { canvas: canvasSummary({ ...(c ?? { screens: 0, created_at: now }), id, name, updated_at: now, archived_at: null } as CanvasRow), event };
  });
}

/** Live canvases, newest updated first; removed ones are hidden. */
export function listCanvases(sql: Sql, project: string): { canvases: Pick<CanvasSummary, "id" | "name" | "screens" | "updated_at">[] } {
  requireProject(sql, project);
  const rows = sql.all<CanvasRow>(`${CANVAS_SELECT} WHERE c.project = ? AND c.archived_at IS NULL ORDER BY c.updated_at DESC, c.id`, project);
  return { canvases: rows.map((r) => ({ id: r.id, name: r.name, screens: r.screens, updated_at: r.updated_at })) };
}

type ScreenRow = ScreenSummary & { html?: string };
/** A canvas and its screens in creation order; html only when `includeHtml`. */
export function readCanvas(sql: Sql, project: string, canvas: string, includeHtml = false): { canvas: CanvasSummary; screens: ScreenRow[] } {
  requireProject(sql, project);
  const c = requireCanvas(sql, project, canvas);
  const rows = sql.all<ScreenRow>(
    `SELECT id, name, width, height, x, y, updated_at${includeHtml ? ", html" : ""} FROM screens WHERE project = ? AND canvas = ? ORDER BY rowid`,
    project, canvas,
  );
  return { canvas: canvasSummary(c), screens: rows.map((r) => ({ ...r })) };
}

const intIn = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= lo && v <= hi;

/** Upsert by id (default: slug of name). Replacing keeps the screen's place in the order. Appends `screen.set`. */
export function setScreen(
  sql: Sql, project: string, input: ScreenInput, now = Date.now(),
): { screen: ScreenSummary; created: boolean; event: LiteEvent } {
  requireProject(sql, project);
  const name = checkName(input?.name);
  const id = checkId("screen", input.id ?? slugify(name));
  if (!intIn(input.width, MIN_SIZE, MAX_SIZE)) throw new Error(`invalid width: use an integer from ${MIN_SIZE} to ${MAX_SIZE}`);
  if (!intIn(input.height, MIN_SIZE, MAX_SIZE)) throw new Error(`invalid height: use an integer from ${MIN_SIZE} to ${MAX_SIZE}`);
  if (typeof input.html !== "string") throw new Error("invalid html: expected text");
  for (const k of ["x", "y"] as const)
    if (input[k] !== undefined && !intIn(input[k], -1_000_000, 1_000_000)) throw new Error(`invalid ${k}: use an integer`);
  const bytes = byteLength(input.html);
  if (bytes > SCREEN_HTML_LIMIT) throw new Error(`screen too large: ${bytes} bytes, limit ${SCREEN_HTML_LIMIT}`);
  const x = input.x ?? null;
  const y = input.y ?? null;
  return sql.transaction(() => {
    requireCanvas(sql, project, input.canvas);
    const exists = sql.all("SELECT 1 FROM screens WHERE project = ? AND canvas = ? AND id = ?", project, input.canvas, id).length > 0;
    if (!exists && sql.all<{ n: number }>("SELECT count(*) AS n FROM screens WHERE project = ? AND canvas = ?", project, input.canvas)[0].n >= SCREENS_PER_CANVAS)
      throw new Error(`too many screens: limit ${SCREENS_PER_CANVAS}`);
    sql.run(
      `INSERT INTO screens (project, canvas, id, name, width, height, html, x, y, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project, canvas, id) DO UPDATE SET name = excluded.name, width = excluded.width, height = excluded.height,
         html = excluded.html, x = excluded.x, y = excluded.y, updated_at = excluded.updated_at`,
      project, input.canvas, id, name, input.width, input.height, input.html, x, y, now,
    );
    sql.run("UPDATE canvases SET updated_at = ? WHERE project = ? AND id = ?", now, project, input.canvas);
    const event = appendEvent(
      sql,
      { project, kind: "screen.set", payload: { canvas: input.canvas, id, name, width: input.width, height: input.height, bytes, created: !exists } },
      now,
    );
    return { screen: { id, name, width: input.width, height: input.height, x, y, updated_at: now }, created: !exists, event };
  });
}

/** Removes a screen and appends `screen.removed`. Already gone: no change, no event. */
export function removeScreen(
  sql: Sql, project: string, canvas: string, id: string, now = Date.now(),
): { screen: { canvas: string; id: string; name?: string }; event: LiteEvent | null } {
  requireProject(sql, project);
  checkId("screen", id);
  return sql.transaction(() => {
    requireCanvas(sql, project, canvas);
    const [s] = sql.all<{ name: string }>("SELECT name FROM screens WHERE project = ? AND canvas = ? AND id = ?", project, canvas, id);
    if (!s) return { screen: { canvas, id }, event: null };
    sql.run("DELETE FROM screens WHERE project = ? AND canvas = ? AND id = ?", project, canvas, id);
    sql.run("UPDATE canvases SET updated_at = ? WHERE project = ? AND id = ?", now, project, canvas);
    const event = appendEvent(sql, { project, kind: "screen.removed", payload: { canvas, id, name: s.name } }, now);
    return { screen: { canvas, id, name: s.name }, event };
  });
}

/** Archives a canvas (rows and the log are kept). Already removed: no change, no event. Never existed: unknown canvas. */
export function removeCanvas(sql: Sql, project: string, canvas: string, now = Date.now()): { canvas: CanvasSummary & { archived_at: number }; event: LiteEvent | null } {
  requireProject(sql, project);
  checkId("canvas", canvas);
  return sql.transaction(() => {
    const [c] = sql.all<CanvasRow>(`${CANVAS_SELECT} WHERE c.project = ? AND c.id = ?`, project, canvas);
    if (!c) throw new Error(`unknown canvas "${canvas}"`);
    if (c.archived_at !== null) return { canvas: { ...canvasSummary(c), archived_at: c.archived_at }, event: null };
    sql.run("UPDATE canvases SET archived_at = ?, updated_at = ? WHERE project = ? AND id = ?", now, now, project, canvas);
    const event = appendEvent(sql, { project, kind: "canvas.removed", payload: { canvas, name: c.name } }, now);
    return { canvas: { ...canvasSummary(c), updated_at: now, archived_at: now }, event };
  });
}
