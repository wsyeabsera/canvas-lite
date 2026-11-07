// Variants (docs/variants.md): a variant is a canvas forked from another at a point in its history. Pure functions over `Sql`; every write
// is one transaction and returns its events for the Hub to broadcast. Events never carry html.
import { checkId, CANVASES_PER_PROJECT, dropScreen, prepareScreen, requireCanvas, requireProject, writeScreen } from "./canvases.ts";
import { slugify } from "./projects.ts";
import { appendEvent, type LiteEvent, type Sql } from "./store.ts";
import { canvasAt, type CanvasAt } from "./timeline.ts";

export type Fork = { canvas: string; seq: number };
export type VariantSummary = { id: string; name: string; screens: number; updated_at: number; forked_from: Fork };
export type Variants = { base: { id: string; name: string; screens: number; updated_at: number }; variants: VariantSummary[]; tournament: string | null };

export const VARIANT_TEXT = {
  fork_canvas:
    "Fork a canvas into a variant: a new canvas that starts as a copy of the canvas as it was at change `seq` (default: now) and remembers where it came from. Fork several to try different directions at once, then change each variant with the usual tools. The base never changes until merge_variant. Counts toward the 20 canvases per project. Answer {canvas: {id, name, forked_from: {canvas, seq}, screens}}.",
  list_variants:
    "List a canvas's variants (the canvases forked from its base): {base, variants: [{id, name, screens, updated_at, forked_from}], tournament} where tournament is the id of the newest tournament on the base, or null. Give the base or any variant.",
  merge_variant:
    "Keep a variant: make the base canvas look exactly like it (its screens, start screen and transition, written as normal changes so the history stays one line). Before that the base is kept as a new variant `<base>-old`, so nothing is lost. The variant itself stays. Only the owner chooses: never merge without being told which variant to keep. Answer {base, variant, preserved}.",
} as const;

const nowSeq = (sql: Sql) => sql.all<{ s: number | null }>("SELECT max(seq) AS s FROM events")[0].s ?? 0;

export function forkedFrom(sql: Sql, project: string, canvas: string): Fork | null {
  const [r] = sql.all<{ f: string | null }>("SELECT forked_from AS f FROM canvases WHERE project = ? AND id = ?", project, canvas);
  return r?.f ? (JSON.parse(r.f) as Fork) : null;
}

/** The canvas a chain of forks started from (a variant of a variant resolves to the first base). */
export function rootOf(sql: Sql, project: string, canvas: string): string {
  let cur = canvas;
  for (let i = 0; i < 10; i++) {
    const f = forkedFrom(sql, project, cur);
    if (!f) return cur;
    cur = f.canvas;
  }
  return cur;
}

const countOf = (sql: Sql, project: string, canvas: string) => sql.all<{ n: number }>("SELECT count(*) AS n FROM screens WHERE project = ? AND canvas = ?", project, canvas)[0].n;

function newCanvas(sql: Sql, project: string, id: string, name: string, from: Fork, now: number): void {
  if (sql.all("SELECT 1 FROM canvases WHERE project = ? AND id = ?", project, id).length) throw new Error(`canvas "${id}" already exists: pick another id`);
  if (sql.all<{ n: number }>("SELECT count(*) AS n FROM canvases WHERE project = ? AND archived_at IS NULL", project)[0].n >= CANVASES_PER_PROJECT)
    throw new Error(`too many canvases: limit ${CANVASES_PER_PROJECT}`);
  sql.run("INSERT INTO canvases (project, id, name, created_at, updated_at, forked_from) VALUES (?, ?, ?, ?, ?, ?)", project, id, name, now, now, JSON.stringify(from));
}

/** Copies a canvas state onto a canvas row: every screen, then the flow. */
function copyScreens(sql: Sql, project: string, to: string, at: CanvasAt, now: number): LiteEvent[] {
  const events = at.screens.map((s) => writeScreen(sql, project, to, prepareScreen({ id: s.id, name: s.name, width: s.width, height: s.height, html: s.html, x: s.x ?? undefined, y: s.y ?? undefined }), now).event);
  sql.run("UPDATE canvases SET start_screen = ?, transition = ? WHERE project = ? AND id = ?", at.start_screen, at.transition, project, to);
  // Replay rebuilds the flow from events alone (src/timeline.ts), so the copy needs its own flow.set.
  events.push(appendEvent(sql, { project, kind: "flow.set", payload: { canvas: to, start_screen: at.start_screen, transition: at.transition } }, now));
  return events;
}

const trim = (id: string) => id.slice(0, 40).replace(/-+$/, "");

/** A new canvas that starts as `canvas` at change `seq` (default now). */
export function forkCanvas(
  sql: Sql, project: string, input: { canvas: string; name: string; id?: string; seq?: number }, now = Date.now(),
): { canvas: { id: string; name: string; forked_from: Fork; screens: number }; events: LiteEvent[] } {
  requireProject(sql, project);
  const name = typeof input?.name === "string" ? input.name : "";
  if (name.trim() === "" || name.length > 100) throw new Error("invalid name: use 1 to 100 characters");
  if (input.seq !== undefined && (!Number.isSafeInteger(input.seq) || input.seq < 0)) throw new Error(`invalid seq "${String(input.seq)}": use a non-negative integer`);
  checkId("canvas", input.canvas);
  const id = checkId("canvas", input.id ?? trim(slugify(`${input.canvas}-${name}`)));
  return sql.transaction(() => {
    requireCanvas(sql, project, input.canvas);
    const at = canvasAt(sql, project, input.canvas, input.seq ?? nowSeq(sql));
    const from: Fork = { canvas: input.canvas, seq: at.seq };
    newCanvas(sql, project, id, name, from, now);
    const events = copyScreens(sql, project, id, at, now);
    events.push(appendEvent(sql, { project, kind: "canvas.forked", payload: { canvas: id, name, from: input.canvas, seq: at.seq } }, now));
    return { canvas: { id, name, forked_from: from, screens: at.screens.length }, events };
  });
}

export function listVariants(sql: Sql, project: string, canvas: string): Variants {
  requireProject(sql, project);
  requireCanvas(sql, project, canvas);
  const root = rootOf(sql, project, canvas);
  const base = requireCanvas(sql, project, root);
  const rows = sql.all<{ id: string; name: string; updated_at: number; f: string }>(
    "SELECT id, name, updated_at, forked_from AS f FROM canvases WHERE project = ? AND archived_at IS NULL AND forked_from IS NOT NULL ORDER BY created_at, rowid", project,
  );
  const variants = rows
    .map((r) => ({ id: r.id, name: r.name, screens: countOf(sql, project, r.id), updated_at: r.updated_at, forked_from: JSON.parse(r.f) as Fork }))
    .filter((v) => v.forked_from.canvas === root);
  const [t] = sql.all<{ id: string }>("SELECT id FROM tournaments WHERE project = ? AND canvas = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", project, root);
  return { base: { id: base.id, name: base.name, screens: base.screens, updated_at: base.updated_at }, variants, tournament: t?.id ?? null };
}

/** Makes the base look like the variant; the old base is kept as `<base>-old`. */
export function mergeVariant(sql: Sql, project: string, variant: string, now = Date.now()): { merged: { base: string; variant: string; preserved: string }; events: LiteEvent[] } {
  requireProject(sql, project);
  checkId("canvas", variant);
  return sql.transaction(() => {
    requireCanvas(sql, project, variant);
    const f = forkedFrom(sql, project, variant);
    if (!f) throw new Error(`canvas "${variant}" is not a variant: nothing to merge`);
    const baseRow = requireCanvas(sql, project, f.canvas);
    const base = baseRow.id;
    const seq = nowSeq(sql);
    let preserved = trim(`${base}-old`);
    for (let n = 2; sql.all("SELECT 1 FROM canvases WHERE project = ? AND id = ?", project, preserved).length; n++) preserved = trim(`${base}`.slice(0, 34)) + `-old-${n}`;
    const cur = canvasAt(sql, project, base, seq);
    newCanvas(sql, project, preserved, `${baseRow.name} (before ${variant})`, { canvas: base, seq: cur.seq }, now);
    const events = copyScreens(sql, project, preserved, cur, now);
    const v = canvasAt(sql, project, variant, seq);
    const keep = new Set(v.screens.map((s) => s.id));
    for (const s of cur.screens) if (!keep.has(s.id)) { const g = dropScreen(sql, project, base, s.id, now); if (g) events.push(g.event); }
    for (const s of v.screens) events.push(writeScreen(sql, project, base, prepareScreen({ id: s.id, name: s.name, width: s.width, height: s.height, html: s.html, x: s.x ?? undefined, y: s.y ?? undefined }), now).event);
    sql.run("UPDATE canvases SET start_screen = ?, transition = ?, updated_at = ? WHERE project = ? AND id = ?", v.start_screen, v.transition, now, project, base);
    events.push(appendEvent(sql, { project, kind: "flow.set", payload: { canvas: base, start_screen: v.start_screen, transition: v.transition } }, now));
    events.push(appendEvent(sql, { project, kind: "variant.merged", payload: { canvas: base, variant, preserved } }, now));
    return { merged: { base, variant, preserved }, events };
  });
}
