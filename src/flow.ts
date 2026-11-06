// Prototype tools (docs/prototype-tools.md): read_flow, validate_flow, patch_screen, set_tour. Pure functions over `Sql`.
// Nothing here has a table: the tour is the latest `tour.set` event of its canvas (the log is the storage), so there is no migration.
import {
  checkId, extractLinks, hasBackLink, prepareScreen, readCanvas, requireCanvas, requireProject, writeScreen, SCREEN_HTML_LIMIT, TRANSITIONS,
  type ScreenResult, type ScreenSummary,
} from "./canvases.ts";
import { coverageOf, scanControls, unlinkedWarnings, unlinkedSummary, type Coverage } from "./coverage.ts";
import { appendEvent, type LiteEvent, type Sql } from "./store.ts";
import { presenterState, type PresenterState } from "./present.ts";
import { reviewPrototype, PASS_SCORE, type Review } from "./review.ts";

export const TOUR_STEPS_MAX = 50;
export const TOUR_DWELL_MIN = 200;
export const TOUR_DWELL_MAX = 60_000;
export const TOUR_NOTE_MAX = 200;
export const PATCH_EDITS_MAX = 20;

export type TourStep = { screen: string; dwell_ms: number; note?: string };

export const FLOW_TEXT = {
  read_flow: `Read a canvas's prototype flow in one call, without html: start_screen (as set, or null), effective_start (what play really opens on: the start screen, else the first screen), transition (the default), every screen with its outgoing links ({to, transition, exists}) and whether it has a data-back control, the tour (steps, or null) and the presenter session when it is on this canvas. Use it to see how the screens connect before editing links.`,
  validate_flow: `Check a canvas's prototype and list what is wrong. issues[] is {severity, kind, screen?, to?, message}: errors are dangling_link (data-to names no screen) and no_screens; warnings are no_start_screen (play uses the first screen), unreachable (no path from the start through data-to links) and bad_transition (data-transition is not one of ${TRANSITIONS.join(", ")}); info is dead_end (no data-to and no data-back, the user cannot leave). ok is true when there are no errors. Warnings also include unlinked_control (a button, a, input, select, summary, role=button|link|tab|menuitem, tabindex or cursor:pointer element with no data-to and no data-back; mark one that intentionally goes nowhere with data-inert). The answer also has coverage {screens, controls, linked, unlinked, ratio}. ALWAYS run it after writing screens and fix every warning (wire the control, or add data-inert) before showing anything with present.`,
  patch_screen: `Change a screen's html in place with find and replace, so adding a link is one small call instead of resending the screen. Give edits [{find, replace, all?}] (1 to ${PATCH_EDITS_MAX}), applied in order to the result of the previous one; or, for a single change, find and replace directly. Each find is plain text (not a pattern) and must occur exactly once, unless all is true (then every occurrence is replaced; it must still occur at least once). Atomic: if any edit fails nothing is written. Errors: edit <i>: find not found / found <n> times (add context or set all) / find is empty; unknown screen; screen too large (limit ${SCREEN_HTML_LIMIT} bytes). The screen keeps its name, size, position and place in the order; one screen.set event is appended. Answer {screen, bytes, replaced:[count per edit], warnings}; warnings are the same as set_screen's, including dangling data-to links and unlinked controls.`,
  set_tour: `Store a scripted walkthrough on a canvas: steps [{screen, dwell_ms, note?}] (1 to ${TOUR_STEPS_MAX}). Play on the watch page runs it by itself: show each screen for dwell_ms (${TOUR_DWELL_MIN} to ${TOUR_DWELL_MAX} ms) with the canvas's default transition, and the note (at most ${TOUR_NOTE_MAX} characters) as a caption. Every screen must exist on the canvas (error: unknown screen "<id>" in step <i>). An empty steps array clears the tour. Replaces any earlier tour. Appends a tour.set event. Answer {canvas, steps, duration_ms}.`,
  review_prototype: `Review a canvas like a product reviewer: is it complete and wired like a real product, not just link-valid? Answer {canvas, score (0-100), ok, issues:[{severity, kind, screen?, message, fix}], stats}. Errors: dangling_link, no_screens. Warnings (they make ok false): no_start_screen, unreachable (no path from the start), no_inbound_link, dead_end (no link out and no data-back), unlinked_control, nav_differs (screens that share a nav or tab bar, a repeated set of 3+ data-to targets, where one lacks an item). Info: no_way_back, missing_state (4+ screens and none named empty, loading, error, success, offline or confirm), no_tour, tour_skips_screen. Every issue has a fix that says exactly what to do. ok means no errors and no warnings. ALWAYS run it after validate_flow and keep fixing (patch_screen, set_screens, set_tour) until ok is true and score is at least ${PASS_SCORE} before you present or show anything; never present a half-finished prototype.`,
  present: `Start presenting a canvas: every open watch page that follows you opens play mode on screen (default: the effective start screen) at once. One presenter session per project; starting again replaces the old one. Answer {presenter:{active, canvas, screen, transition}}. Move it with goto, end it with stop_present.`,
  goto: `While presenting, move every following watch page to a screen of the presented canvas, playing transition (default: the canvas default transition; one of ${TRANSITIONS.join(", ")}). Error "not presenting: call present first" when no session is active; unknown screen "<id>" when the screen is not on the presented canvas. Answer {presenter:{active, canvas, screen, transition}}.`,
  stop_present: `End the presenter session: following watch pages stay where they are and the Claude is presenting pill goes away. Nothing to stop is not an error ({presenter:{active:false}}).`,
};

const isTransition = (t: string | null): boolean => t === null || (TRANSITIONS as readonly string[]).includes(t);

/** The screen play opens on: the start screen if it is still a screen, else the first screen, else null. */
export function effectiveStart(start: string | null, ids: string[]): string | null {
  return start !== null && ids.includes(start) ? start : (ids[0] ?? null);
}

export type FlowScreen = { id: string; name: string; links: { to: string; transition: string | null; exists: boolean }[]; back: boolean };
export type Issue = { severity: "error" | "warning" | "info"; kind: string; screen?: string; to?: string; message: string };

/** Pure: the screens (with html) and the start screen -> issues, errors first, then warnings, then info; each group in screen order. */
export function validateScreens(screens: { id: string; html: string }[], start: string | null): Issue[] {
  const issues: Issue[] = [];
  const ids = screens.map((s) => s.id);
  if (screens.length === 0) return [{ severity: "error", kind: "no_screens", message: "the canvas has no screens" }];
  const links = new Map(screens.map((s) => [s.id, extractLinks(s.html)]));
  const eff = effectiveStart(start, ids)!;
  if (start === null) issues.push({ severity: "warning", kind: "no_start_screen", screen: eff, message: `no start screen set: play opens on "${eff}", the first screen` });
  const reach = new Set([eff]);
  const queue = [eff];
  for (let id = queue.shift(); id !== undefined; id = queue.shift())
    for (const { to } of links.get(id) ?? []) if (ids.includes(to) && !reach.has(to)) (reach.add(to), queue.push(to));
  for (const s of screens) {
    const seen = new Set<string>();
    for (const { to, transition } of links.get(s.id)!) {
      if (!ids.includes(to) && !seen.has(to)) {
        seen.add(to);
        issues.push({ severity: "error", kind: "dangling_link", screen: s.id, to, message: `"${s.id}" links to "${to}", which is not a screen` });
      }
      if (!isTransition(transition))
        issues.push({ severity: "warning", kind: "bad_transition", screen: s.id, to, message: `"${s.id}" -> "${to}" has data-transition "${transition}": it falls back to the canvas default` });
    }
  }
  for (const s of screens) {
    const c = scanControls(s.html);
    if (c.unlinked > 0) issues.push({ severity: "warning", kind: "unlinked_control", screen: s.id, message: `"${s.id}" has ${unlinkedSummary(c.unlinked, c.items)}: wire each with data-to or data-back, or mark it data-inert` });
  }
  for (const s of screens)
    if (!reach.has(s.id)) issues.push({ severity: "warning", kind: "unreachable", screen: s.id, message: `"${s.id}" cannot be reached from "${eff}"` });
  for (const s of screens)
    if (links.get(s.id)!.length === 0 && !hasBackLink(s.html)) issues.push({ severity: "info", kind: "dead_end", screen: s.id, message: `"${s.id}" has no links out and no back control` });
  const order = { error: 0, warning: 1, info: 2 };
  return issues.map((v, i) => [v, i] as const).sort((a, b) => order[a[0].severity] - order[b[0].severity] || a[1] - b[1]).map(([v]) => v);
}

function screenRows(sql: Sql, project: string, canvas: string) {
  return sql.all<{ id: string; name: string; html: string }>("SELECT id, name, html FROM screens WHERE project = ? AND canvas = ? ORDER BY rowid", project, canvas);
}

export type FlowRead = {
  canvas: string; start_screen: string | null; effective_start: string | null; transition: string;
  screens: FlowScreen[]; tour: TourRead | null; presenter: PresenterState | null;
};

export function readFlow(sql: Sql, project: string, canvas: string): FlowRead {
  requireProject(sql, project);
  const c = requireCanvas(sql, project, canvas);
  const rows = screenRows(sql, project, canvas);
  const ids = rows.map((r) => r.id);
  const p = presenterState(sql, project);
  return {
    canvas, start_screen: c.start_screen, effective_start: effectiveStart(c.start_screen, ids), transition: c.transition,
    screens: rows.map((r) => ({ id: r.id, name: r.name, links: extractLinks(r.html).map((l) => ({ ...l, exists: ids.includes(l.to) })), back: hasBackLink(r.html) })),
    tour: readTour(sql, project, canvas), presenter: p && p.canvas === canvas ? p : null,
  };
}

export function validateFlow(sql: Sql, project: string, canvas: string): { canvas: string; ok: boolean; start_screen: string | null; effective_start: string | null; issues: Issue[]; coverage: Coverage } {
  requireProject(sql, project);
  const c = requireCanvas(sql, project, canvas);
  const rows = screenRows(sql, project, canvas);
  const issues = validateScreens(rows, c.start_screen !== null && rows.some((r) => r.id === c.start_screen) ? c.start_screen : null);
  return { canvas, ok: !issues.some((i) => i.severity === "error"), start_screen: c.start_screen, effective_start: effectiveStart(c.start_screen, rows.map((r) => r.id)), issues, coverage: coverageOf(rows.map((r) => scanControls(r.html))) };
}

export type PatchEdit = { find: string; replace: string; all?: boolean };

/** Pure: applies the edits in order. Throws `edit <i>: ...` for an empty find, no match, or several matches without `all`. Plain text, no patterns (so `$&` in a replacement is literal). */
export function applyEdits(html: string, edits: PatchEdit[]): { html: string; replaced: number[] } {
  if (!Array.isArray(edits) || edits.length < 1 || edits.length > PATCH_EDITS_MAX) throw new Error(`invalid edits: use 1 to ${PATCH_EDITS_MAX} edits per call`);
  const replaced: number[] = [];
  edits.forEach((e, i) => {
    if (typeof e?.find !== "string" || typeof e.replace !== "string") throw new Error(`edit ${i}: find and replace must be text`);
    if (e.find === "") throw new Error(`edit ${i}: find is empty`);
    const parts = html.split(e.find);
    const n = parts.length - 1;
    if (n === 0) throw new Error(`edit ${i}: find not found`);
    if (n > 1 && !e.all) throw new Error(`edit ${i}: find found ${n} times: add context to make it unique or set all`);
    html = parts.join(e.replace);
    replaced.push(n);
  });
  return { html, replaced };
}

/** Find and replace inside one screen's html, atomically, through the same checks and warnings as set_screen. One `screen.set` event. */
export function patchScreen(
  sql: Sql, project: string, canvas: string, id: string, edits: PatchEdit[], now = Date.now(),
): { screen: ScreenSummary; bytes: number; replaced: number[]; warnings: string[]; event: LiteEvent } {
  requireProject(sql, project);
  checkId("screen", id);
  return sql.transaction(() => {
    requireCanvas(sql, project, canvas);
    const [row] = sql.all<ScreenSummary & { html: string }>("SELECT id, name, width, height, x, y, updated_at, html FROM screens WHERE project = ? AND canvas = ? AND id = ?", project, canvas, id);
    if (!row) throw new Error(`unknown screen "${id}" on canvas "${canvas}"`);
    const { html, replaced } = applyEdits(row.html, edits);
    const p = prepareScreen({ id, name: row.name, width: row.width, height: row.height, html, ...(row.x !== null && { x: row.x }), ...(row.y !== null && { y: row.y }) });
    const { result, event } = writeScreen(sql, project, canvas, p, now);
    // Same dangling warnings as set_screen, against the canvas as it is now.
    const have = new Set(screenRows(sql, project, canvas).map((r) => r.id));
    const seen = new Set<string>();
    for (const { to } of extractLinks(html))
      if (!have.has(to) && !seen.has(to)) (seen.add(to), result.warnings.push(`dangling link: data-to="${to}" has no screen`));
    result.warnings.push(...unlinkedWarnings(html));
    const { created: _c, bytes, warnings, ...screen } = result as ScreenResult;
    return { screen, bytes, replaced, warnings, event };
  });
}

/** Pure: steps -> a validated copy (throws `invalid step <i>: ...`). */
export function checkTour(steps: unknown): TourStep[] {
  if (!Array.isArray(steps) || steps.length > TOUR_STEPS_MAX) throw new Error(`invalid steps: use 0 to ${TOUR_STEPS_MAX} steps`);
  return steps.map((s, i) => {
    if (typeof s?.screen !== "string") throw new Error(`invalid step ${i}: screen must be a screen id`);
    checkId("screen", s.screen);
    if (!Number.isSafeInteger(s.dwell_ms) || s.dwell_ms < TOUR_DWELL_MIN || s.dwell_ms > TOUR_DWELL_MAX)
      throw new Error(`invalid step ${i}: dwell_ms must be an integer from ${TOUR_DWELL_MIN} to ${TOUR_DWELL_MAX}`);
    if (s.note !== undefined && (typeof s.note !== "string" || s.note.length > TOUR_NOTE_MAX)) throw new Error(`invalid step ${i}: note must be text of at most ${TOUR_NOTE_MAX} characters`);
    return { screen: s.screen, dwell_ms: s.dwell_ms, ...(s.note !== undefined && s.note !== "" && { note: s.note }) };
  });
}

export const tourDuration = (steps: TourStep[]): number => steps.reduce((t, s) => t + s.dwell_ms, 0);

/** Stores the tour (empty steps clear it) as a `tour.set` event {canvas, steps}; every screen must exist now. */
export function setTour(sql: Sql, project: string, canvas: string, steps: unknown, now = Date.now()): { canvas: string; steps: TourStep[]; duration_ms: number; event: LiteEvent } {
  requireProject(sql, project);
  const checked = checkTour(steps);
  return sql.transaction(() => {
    requireCanvas(sql, project, canvas);
    const have = new Set(screenRows(sql, project, canvas).map((r) => r.id));
    checked.forEach((s, i) => {
      if (!have.has(s.screen)) throw new Error(`unknown screen "${s.screen}" in step ${i}`);
    });
    sql.run("UPDATE canvases SET updated_at = ? WHERE project = ? AND id = ?", now, project, canvas);
    const event = appendEvent(sql, { project, kind: "tour.set", payload: { canvas, steps: checked } }, now);
    return { canvas, steps: checked, duration_ms: tourDuration(checked), event };
  });
}

export type TourRead = { steps: TourStep[]; duration_ms: number; missing: number[] };

/** The canvas's current tour (latest `tour.set`), or null when never set or cleared. `missing` lists step indexes whose screen was removed since. */
export function readTour(sql: Sql, project: string, canvas: string): TourRead | null {
  const [r] = sql.all<{ payload: string }>(
    "SELECT payload FROM events WHERE project = ? AND kind = 'tour.set' AND json_extract(payload, '$.canvas') = ? ORDER BY seq DESC LIMIT 1", project, canvas,
  );
  const steps: TourStep[] = r ? JSON.parse(r.payload).steps : [];
  if (steps.length === 0) return null;
  const have = new Set(screenRows(sql, project, canvas).map((s) => s.id));
  return { steps, duration_ms: tourDuration(steps), missing: steps.flatMap((s, i) => (have.has(s.screen) ? [] : [i])) };
}

export type TourPosition = { index: number; step: TourStep; into_ms: number; progress: number; done: boolean };

/** Pure timeline: where a tour is `t` ms after it started. At or past the end: the last step, `done`, progress 1. Negative t counts as 0. Null for no steps. */
export function tourPosition(steps: TourStep[], t: number): TourPosition | null {
  if (steps.length === 0) return null;
  let start = 0;
  const at = Math.max(0, t);
  for (let i = 0; i < steps.length; i++) {
    const end = start + steps[i].dwell_ms;
    if (at < end) return { index: i, step: steps[i], into_ms: at - start, progress: (at - start) / steps[i].dwell_ms, done: false };
    start = end;
  }
  const last = steps.length - 1;
  return { index: last, step: steps[last], into_ms: steps[last].dwell_ms, progress: 1, done: true };
}

/** What the watch page loads for a canvas: the stored canvas plus its tour and the project's presenter session. */
export function readCanvasForPage(sql: Sql, project: string, canvas: string) {
  const r = readCanvas(sql, project, canvas, true);
  return { ...r, tour: readTour(sql, project, canvas), presenter: presenterState(sql, project) };
}

/** The canvas as a product review: `reviewPrototype` over its screens, start screen and tour. */
export function reviewFlow(sql: Sql, project: string, canvas: string): { canvas: string } & Review {
  requireProject(sql, project);
  const c = requireCanvas(sql, project, canvas);
  return { canvas, ...reviewPrototype({ screens: screenRows(sql, project, canvas), start: c.start_screen, tour: readTour(sql, project, canvas)?.steps ?? null }) };
}
