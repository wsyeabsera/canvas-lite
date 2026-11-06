// Canvases and screens as pure functions over `Sql` (docs/canvas.md). Every change appends its event in the same
// transaction and returns it for the Hub to broadcast. Events never carry html.
import { appendEvent, type LiteEvent, type Sql } from "./store.ts";
import { scanControls, unlinkedWarnings } from "./coverage.ts";
import { slugify } from "./projects.ts";
import { layoutScreens } from "./layout.ts";
import { recordVersion } from "./timeline.ts";

export const SCREEN_HTML_LIMIT = 200_000;
export const SCREENS_PER_CANVAS = 50;
export const CANVASES_PER_PROJECT = 20;
export const MIN_SIZE = 100;
export const MAX_SIZE = 8000;
export const SCREENS_PER_CALL = 20;
export const HTML_WARN_BYTES = 150_000;

export const TRANSITIONS = ["none", "fade", "slide-left", "slide-right", "push"] as const;
export type Transition = (typeof TRANSITIONS)[number];

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** Tool texts, built from the limits so the guidance never drifts from the checks. Pure, so unit tests read it. */
export const CANVAS_TEXT = {
  create_canvas: `Create a canvas in a project: a named board that holds screens (UI designs) the watch page shows live. Idempotent by id: creating an existing canvas changes nothing; creating a removed one brings it back. At most ${CANVASES_PER_PROJECT} canvases per project (error "too many canvases: limit ${CANVASES_PER_PROJECT}").`,
  list_canvases: `List a project's canvases (id, name, screen count, updated_at), removed ones hidden.`,
  read_canvas: `Return a canvas and its screens (id, name, width, height, x, y, layout, updated_at, bytes = UTF-8 size of its html). x and y are as stored (null = automatic); layout {x, y} is where the watch page actually places the screen (automatic screens fill rows of 3, 160 px apart), so you can position new screens relative to it. The html of each screen is left out unless include_html is true; ask for it only when you need to edit a screen's markup.`,
  set_screen:
    `Create or replace one screen on a canvas (upsert by id; replacing keeps the screen's place in the order). ` +
    `The id defaults to the slug of name (lowercase letters, digits and -, truncated at 40 characters): the same name replaces that screen, a different name makes a second screen, and two long names sharing their first 40 characters collide. Pass id explicitly to be safe. ` +
    `To change many screens in one go use set_screens. ` +
    `html is ONE self-contained HTML document per screen: inline CSS, no scripts. Images may be https URLs or data: URIs; nothing else is loaded (no fonts or stylesheets from other origins, no fetch). ` +
    `Size the root element to width x height CSS pixels (width and height are integers from ${MIN_SIZE} to ${MAX_SIZE}). ` +
    `html is at most ${SCREEN_HTML_LIMIT} bytes (error "screen too large: <n> bytes, limit ${SCREEN_HTML_LIMIT}"); at most ${SCREENS_PER_CANVAS} screens per canvas (error "too many screens: limit ${SCREENS_PER_CANVAS}"). ` +
    `x and y (integers) place the screen on the canvas; leave them out for automatic layout. ` +
    `The answer has bytes (UTF-8 size of html) and warnings (short strings, e.g. html contains <script>, html is large, html has no content, dangling link, N unlinked controls: "<text>", ... for buttons/links/inputs with no data-to or data-back; add the link or mark it data-inert); fix what they say, then ALWAYS run validate_flow before showing anything.`,
  set_screens:
    `Create or replace up to ${SCREENS_PER_CALL} screens on one canvas in a single call. Use it whenever you set more than one screen (a whole flow, a redesign): it is one round trip and ALL OR NOTHING, so a bad screen rejects the call, nothing is written, and the error starts with "screen <index> (<name>): " (index counts from 0). ` +
    `Each screen takes the same fields and limits as set_screen (name, width, height, html, optional id, x, y); the id defaults to the slug of name truncated at 40 characters, so the same name replaces and a different name makes another screen: pass id explicitly to be safe. ` +
    `The answer is {screens:[{id, name, width, height, x, y, updated_at, bytes, created, warnings}]} in input order; the watch page gets one live update per screen.`,
  set_flow: `Set a canvas's prototype flow: start_screen (the id of a screen on the canvas, or null to clear it) and the default transition (${TRANSITIONS.join(", ")}). Give at least one. Links live in screen html: data-to="<screen id>" on an element, optional data-transition="<transition>", and data-back for a back control. set_screen and set_screens warn about a data-to that has no screen on the canvas.`,
  remove_screen: `Remove a screen from a canvas (by its id from read_canvas). Removing a screen that is already gone does nothing. The change log keeps the removal; the html is gone, so set_screen it again to bring it back.`,
  remove_canvas: `Archive a canvas and its screens from view: it disappears from list_canvases and the watch page, and a canvas.removed event is recorded. Removing an already removed canvas does nothing; create_canvas with the same id brings it back.`,
};

/** Short notes on html that will not show as the author expects. Empty array = nothing to say. */
export function screenWarnings(html: string, bytes = byteLength(html)): string[] {
  const w: string[] = [];
  if (html.trim() === "") w.push("html has no content");
  if (/<script/i.test(html)) w.push("html contains <script>: scripts never run in the sandbox");
  if (bytes > HTML_WARN_BYTES) w.push(`html is large: ${bytes} bytes (limit ${SCREEN_HTML_LIMIT})`);
  return w;
}

const TAG_RE = /<[a-zA-Z][^\s>\/]*((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTR_RE = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** True when any element carries the `data-back` attribute (a back control). Same tolerant reading as extractLinks. */
export function hasBackLink(html: string): boolean {
  for (const tag of html.replace(/<!--[\s\S]*?(?:-->|$)/g, "").matchAll(TAG_RE))
    for (const a of tag[1].matchAll(ATTR_RE)) if (a[1].toLowerCase() === "data-back") return true;
  return false;
}

/** Links in screen html: every element with `data-to`, with its `data-transition` (null when absent). Tolerant, no DOM: malformed html yields what can be read. */
export function extractLinks(html: string): { to: string; transition: string | null }[] {
  const out: { to: string; transition: string | null }[] = [];
  for (const tag of html.replace(/<!--[\s\S]*?(?:-->|$)/g, "").matchAll(TAG_RE)) {
    let to: string | null = null;
    let transition: string | null = null;
    for (const a of tag[1].matchAll(ATTR_RE)) {
      const name = a[1].toLowerCase();
      const value = (a[2] ?? a[3] ?? a[4] ?? "").trim();
      if (name === "data-to" && to === null) to = value;
      else if (name === "data-transition" && transition === null) transition = value;
    }
    if (to) out.push({ to, transition });
  }
  return out;
}

/** One warning per distinct `data-to` that names no screen on the canvas (checked against the rows as they are now). */
function danglingWarnings(sql: Sql, project: string, canvas: string, html: string): string[] {
  const have = new Set(sql.all<{ id: string }>("SELECT id FROM screens WHERE project = ? AND canvas = ?", project, canvas).map((r) => r.id));
  const seen = new Set<string>();
  const w: string[] = [];
  for (const { to } of extractLinks(html))
    if (!have.has(to) && !seen.has(to)) {
      seen.add(to);
      w.push(`dangling link: data-to="${to}" has no screen`);
    }
  return w;
}

export type CanvasSummary = { id: string; name: string; screens: number; created_at: number; updated_at: number };
export type ScreenSummary = { id: string; name: string; width: number; height: number; x: number | null; y: number | null; updated_at: number };
export type ScreenInput = { canvas: string; name: string; width: number; height: number; html: string; id?: string; x?: number; y?: number };
export type ScreenFields = Omit<ScreenInput, "canvas">;
export type ScreenResult = ScreenSummary & { bytes: number; created: boolean; warnings: string[] };

export type CanvasRow = { id: string; name: string; created_at: number; updated_at: number; archived_at: number | null; screens: number; start_screen: string | null; transition: Transition };
const CANVAS_SELECT =
  "SELECT c.id, c.name, c.created_at, c.updated_at, c.archived_at, c.start_screen, c.transition, (SELECT count(*) FROM screens s WHERE s.project = c.project AND s.canvas = c.id) AS screens FROM canvases c";
const canvasSummary = (r: CanvasRow): CanvasSummary => ({ id: r.id, name: r.name, screens: r.screens, created_at: r.created_at, updated_at: r.updated_at });

export function requireProject(sql: Sql, project: string): void {
  const [p] = sql.all<{ archived_at: number | null }>("SELECT archived_at FROM projects WHERE id = ?", project);
  if (!p || p.archived_at !== null) throw new Error(`unknown project "${project}"`);
}

function checkName(name: unknown): string {
  if (typeof name !== "string" || name.trim() === "" || name.length > 100) throw new Error("invalid name: use 1 to 100 characters");
  return name;
}

export function checkId(kind: "canvas" | "screen", id: unknown): string {
  if (typeof id !== "string" || id.length > 40 || !ID_RE.test(id))
    throw new Error(`invalid ${kind} id "${String(id)}": use lowercase letters, digits and -, at most 40`);
  return id;
}

/** The live (not removed) canvas row, else `unknown canvas`. */
export function requireCanvas(sql: Sql, project: string, canvas: string): CanvasRow {
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

export type PageCanvasEntry = Pick<CanvasSummary, "id" | "name" | "screens" | "updated_at"> & { start_screen: string | null; dangling: number; unlinked: number };

/** Link health of one canvas: `dangling` = links to a screen that does not exist (each target once per screen, as validate_flow counts),
 *  `unlinked` = controls with no data-to/data-back/data-inert (the same scan as the write-time warning). Pure. */
export function linkStats(screens: { id: string; html: string }[]): { dangling: number; unlinked: number } {
  const ids = new Set(screens.map((s) => s.id));
  let dangling = 0, unlinked = 0;
  for (const s of screens) {
    dangling += new Set(extractLinks(s.html).map((l) => l.to).filter((to) => !ids.has(to))).size;
    unlinked += scanControls(s.html).unlinked;
  }
  return { dangling, unlinked };
}

/** `listCanvases` plus what the landing page needs in one call: `start_screen` (null = first screen), `dangling`, `unlinked`.
 *  Kept apart from `listCanvases` so the `list_canvases` tool answer does not change. */
export function listCanvasesForPage(sql: Sql, project: string): { canvases: PageCanvasEntry[] } {
  requireProject(sql, project);
  const rows = sql.all<CanvasRow>(`${CANVAS_SELECT} WHERE c.project = ? AND c.archived_at IS NULL ORDER BY c.updated_at DESC, c.id`, project);
  return {
    canvases: rows.map((r) => ({
      id: r.id, name: r.name, screens: r.screens, updated_at: r.updated_at, start_screen: r.start_screen,
      ...linkStats(sql.all<{ id: string; html: string }>("SELECT id, html FROM screens WHERE project = ? AND canvas = ?", project, r.id)),
    })),
  };
}

type ScreenRow = ScreenSummary & { bytes: number; layout: { x: number; y: number }; html?: string };
/** A canvas and its screens in creation order; each with `bytes` (UTF-8 size of its html), the html itself only when `includeHtml`. */
export function readCanvas(
  sql: Sql, project: string, canvas: string, includeHtml = false,
): { canvas: CanvasSummary & { start_screen: string | null; transition: Transition }; screens: ScreenRow[] } {
  requireProject(sql, project);
  const c = requireCanvas(sql, project, canvas);
  const rows = sql.all<ScreenSummary & { html: string }>(
    "SELECT id, name, width, height, x, y, updated_at, html FROM screens WHERE project = ? AND canvas = ? ORDER BY rowid",
    project, canvas,
  );
  const boxes = layoutScreens(rows);
  const screens = rows.map(({ html, ...r }, i): ScreenRow => ({
    ...r, bytes: byteLength(html), layout: { x: boxes[i].x, y: boxes[i].y }, ...(includeHtml ? { html } : {}),
  }));
  return { canvas: { ...canvasSummary(c), start_screen: c.start_screen, transition: c.transition }, screens };
}

const intIn = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= lo && v <= hi;

export type Prepared = { id: string; name: string; width: number; height: number; html: string; x: number | null; y: number | null; bytes: number };

/** Validates one screen's fields (everything but the canvas and project) and returns what is written. */
export function prepareScreen(input: ScreenFields): Prepared {
  const name = checkName(input?.name);
  const id = checkId("screen", input.id ?? slugify(name));
  if (!intIn(input.width, MIN_SIZE, MAX_SIZE)) throw new Error(`invalid width: use an integer from ${MIN_SIZE} to ${MAX_SIZE}`);
  if (!intIn(input.height, MIN_SIZE, MAX_SIZE)) throw new Error(`invalid height: use an integer from ${MIN_SIZE} to ${MAX_SIZE}`);
  if (typeof input.html !== "string") throw new Error("invalid html: expected text");
  for (const k of ["x", "y"] as const)
    if (input[k] !== undefined && !intIn(input[k], -1_000_000, 1_000_000)) throw new Error(`invalid ${k}: use an integer`);
  const bytes = byteLength(input.html);
  if (bytes > SCREEN_HTML_LIMIT) throw new Error(`screen too large: ${bytes} bytes, limit ${SCREEN_HTML_LIMIT}`);
  return { id, name, width: input.width, height: input.height, html: input.html, x: input.x ?? null, y: input.y ?? null, bytes };
}

/** Writes one prepared screen inside a transaction (canvas already checked): row, canvas touch, `screen.set`. */
export function writeScreen(sql: Sql, project: string, canvas: string, p: Prepared, now: number): { result: ScreenResult; event: LiteEvent } {
  const exists = sql.all("SELECT 1 FROM screens WHERE project = ? AND canvas = ? AND id = ?", project, canvas, p.id).length > 0;
  if (!exists && sql.all<{ n: number }>("SELECT count(*) AS n FROM screens WHERE project = ? AND canvas = ?", project, canvas)[0].n >= SCREENS_PER_CANVAS)
    throw new Error(`too many screens: limit ${SCREENS_PER_CANVAS}`);
  sql.run(
    `INSERT INTO screens (project, canvas, id, name, width, height, html, x, y, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project, canvas, id) DO UPDATE SET name = excluded.name, width = excluded.width, height = excluded.height,
       html = excluded.html, x = excluded.x, y = excluded.y, updated_at = excluded.updated_at`,
    project, canvas, p.id, p.name, p.width, p.height, p.html, p.x, p.y, now,
  );
  sql.run("UPDATE canvases SET updated_at = ? WHERE project = ? AND id = ?", now, project, canvas);
  const event = appendEvent(
    sql,
    { project, kind: "screen.set", payload: { canvas, id: p.id, name: p.name, width: p.width, height: p.height, bytes: p.bytes, created: !exists } },
    now,
  );
  recordVersion(sql, project, canvas, event.seq, { id: p.id, name: p.name, width: p.width, height: p.height, html: p.html, x: p.x, y: p.y });
  const result: ScreenResult = {
    id: p.id, name: p.name, width: p.width, height: p.height, x: p.x, y: p.y, updated_at: now,
    bytes: p.bytes, created: !exists, warnings: screenWarnings(p.html, p.bytes),
  };
  return { result, event };
}

/** Upsert by id (default: slug of name). Replacing keeps the screen's place in the order. Appends `screen.set`. */
export function setScreen(
  sql: Sql, project: string, input: ScreenInput, now = Date.now(),
): { screen: ScreenSummary; created: boolean; bytes: number; warnings: string[]; event: LiteEvent } {
  requireProject(sql, project);
  const p = prepareScreen(input);
  return sql.transaction(() => {
    requireCanvas(sql, project, input.canvas);
    const { result, event } = writeScreen(sql, project, input.canvas, p, now);
    result.warnings.push(...danglingWarnings(sql, project, input.canvas, p.html), ...unlinkedWarnings(p.html));
    const { created, bytes, warnings, ...screen } = result;
    return { screen, created, bytes, warnings, event };
  });
}

/** Up to SCREENS_PER_CALL screens in one transaction: any failure writes nothing (errors start `screen <i> (<name>): `). One event per screen, in order. */
export function setScreens(
  sql: Sql, project: string, canvas: string, screens: ScreenFields[], now = Date.now(),
): { screens: ScreenResult[]; events: LiteEvent[] } {
  requireProject(sql, project);
  if (!Array.isArray(screens) || screens.length < 1 || screens.length > SCREENS_PER_CALL)
    throw new Error(`invalid screens: use 1 to ${SCREENS_PER_CALL} screens per call`);
  const label = (i: number) => `screen ${i} (${typeof screens[i]?.name === "string" ? screens[i].name : "?"}): `;
  const prepared = screens.map((s, i) => {
    try {
      return prepareScreen(s);
    } catch (e) {
      throw new Error(label(i) + (e instanceof Error ? e.message : String(e)));
    }
  });
  return sql.transaction(() => {
    requireCanvas(sql, project, canvas);
    const out: ScreenResult[] = [];
    const events: LiteEvent[] = [];
    prepared.forEach((p, i) => {
      try {
        const { result, event } = writeScreen(sql, project, canvas, p, now);
        out.push(result);
        events.push(event);
      } catch (e) {
        throw new Error(label(i) + (e instanceof Error ? e.message : String(e)));
      }
    });
    // Links are checked once every screen of the call is written, so a link to a later screen in the same call is fine.
    out.forEach((r, i) => r.warnings.push(...danglingWarnings(sql, project, canvas, prepared[i].html), ...unlinkedWarnings(prepared[i].html)));
    return { screens: out, events };
  });
}

/** Sets the start screen (an existing screen id, or null to clear) and/or the default transition; appends `flow.set`. No change: no event. */
export function setFlow(
  sql: Sql, project: string, canvas: string, input: { start_screen?: string | null; transition?: string }, now = Date.now(),
): { flow: { canvas: string; start_screen: string | null; transition: Transition }; event: LiteEvent | null } {
  requireProject(sql, project);
  if (input?.start_screen === undefined && input?.transition === undefined) throw new Error("invalid flow: give start_screen or transition");
  if (input.transition !== undefined && !(TRANSITIONS as readonly string[]).includes(input.transition))
    throw new Error(`invalid transition "${String(input.transition)}": use ${TRANSITIONS.join(", ")}`);
  if (input.start_screen !== undefined && input.start_screen !== null) checkId("screen", input.start_screen);
  return sql.transaction(() => {
    const c = requireCanvas(sql, project, canvas);
    const start = input.start_screen === undefined ? c.start_screen : input.start_screen;
    const transition = (input.transition as Transition | undefined) ?? c.transition;
    if (start !== null && sql.all("SELECT 1 FROM screens WHERE project = ? AND canvas = ? AND id = ?", project, canvas, start).length === 0)
      throw new Error(`unknown screen "${start}" on canvas "${canvas}"`);
    const flow = { canvas, start_screen: start, transition };
    if (start === c.start_screen && transition === c.transition) return { flow, event: null };
    sql.run("UPDATE canvases SET start_screen = ?, transition = ?, updated_at = ? WHERE project = ? AND id = ?", start, transition, now, project, canvas);
    const event = appendEvent(sql, { project, kind: "flow.set", payload: flow }, now);
    return { flow, event };
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
    sql.run("UPDATE canvases SET start_screen = NULL WHERE project = ? AND id = ? AND start_screen = ?", project, canvas, id);
    sql.run("UPDATE canvases SET updated_at = ? WHERE project = ? AND id = ?", now, project, canvas);
    const event = appendEvent(sql, { project, kind: "screen.removed", payload: { canvas, id, name: s.name } }, now);
    recordVersion(sql, project, canvas, event.seq, { id, name: s.name, width: 100, height: 100, html: "", x: null, y: null, removed: true });
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
