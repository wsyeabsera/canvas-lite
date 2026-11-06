// Replay a canvas (docs/api.md, docs/database.md): the timeline of its events and its state as of any event seq.
// Events carry no html, so every screen.set / screen.removed also writes a `screen_versions` row keyed by that event's
// seq, in the same transaction (recordVersion, called from src/canvases.ts). Flow state is rebuilt from the events alone.
import type { Sql } from "./store.ts";
import { layoutScreens } from "./layout.ts";

export type Version = { id: string; name: string; width: number; height: number; html: string; x: number | null; y: number | null; removed?: boolean };

/** Called inside the transaction that appended event `seq` (screen.set or screen.removed). Never called for flow.set. */
export function recordVersion(sql: Sql, project: string, canvas: string, seq: number, v: Version): void {
  sql.run(
    "INSERT INTO screen_versions (project, canvas, screen, seq, name, width, height, html, x, y, removed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    project, canvas, v.id, seq, v.name, v.width, v.height, v.html, v.x, v.y, v.removed ? 1 : 0,
  );
}

function requireLiveCanvas(sql: Sql, project: string, canvas: string): { name: string } {
  const [p] = sql.all<{ archived_at: number | null }>("SELECT archived_at FROM projects WHERE id = ?", project);
  if (!p || p.archived_at !== null) throw new Error(`unknown project "${project}"`);
  const [c] = sql.all<{ name: string; archived_at: number | null }>("SELECT name, archived_at FROM canvases WHERE project = ? AND id = ?", project, canvas);
  if (!c || c.archived_at !== null) throw new Error(`unknown canvas "${canvas}"`);
  return c;
}

const KINDS = "('canvas.created', 'screen.set', 'screen.removed', 'flow.set')";

export type TimelineEntry = { seq: number; ts: number; kind: string; screen: string | null; name: string | null };

/** The canvas's events, oldest first: canvas.created, screen.set, screen.removed, flow.set. `screen` and `name` are null for the others. */
export function canvasTimeline(sql: Sql, project: string, canvas: string): { canvas: string; events: TimelineEntry[] } {
  requireLiveCanvas(sql, project, canvas);
  const rows = sql.all<{ seq: number; ts: number; kind: string; payload: string }>(
    `SELECT seq, ts, kind, payload FROM events WHERE project = ? AND kind IN ${KINDS} AND json_extract(payload, '$.canvas') = ? ORDER BY seq`,
    project, canvas,
  );
  const events = rows.map((r): TimelineEntry => {
    const p = JSON.parse(r.payload);
    const isScreen = r.kind === "screen.set" || r.kind === "screen.removed";
    return { seq: r.seq, ts: r.ts, kind: r.kind, screen: isScreen ? p.id ?? null : null, name: isScreen ? p.name ?? null : null };
  });
  return { canvas, events };
}

export type AtScreen = { id: string; name: string; width: number; height: number; x: number | null; y: number | null; seq: number; bytes: number; layout: { x: number; y: number }; html: string };
export type CanvasAt = {
  canvas: { id: string; name: string };
  seq: number;
  ts: number | null;
  screens: AtScreen[];
  start_screen: string | null;
  transition: string;
};

/**
 * The canvas as it was after event `seq` (any non-negative integer: a seq past the end is the latest state, 0 is empty).
 * Each screen is its newest version at or before `seq` unless that is a removal. Order is creation order, a screen
 * recreated after a removal counting as new. Flow comes from the flow.set events, and a removed start screen clears it,
 * as `removeScreen` does live. ts is the timestamp of the canvas event at exactly `seq`, else null.
 */
export function canvasAt(sql: Sql, project: string, canvas: string, seq: number): CanvasAt {
  if (!Number.isSafeInteger(seq) || seq < 0) throw new Error(`invalid seq "${String(seq)}": use a non-negative integer`);
  const c = requireLiveCanvas(sql, project, canvas);
  const rows = sql.all<Omit<AtScreen, "bytes" | "layout">>(
    `SELECT v.screen AS id, v.name, v.width, v.height, v.x, v.y, v.seq, v.html FROM screen_versions v
     WHERE v.project = ?1 AND v.canvas = ?2 AND v.removed = 0
       AND v.seq = (SELECT max(w.seq) FROM screen_versions w WHERE w.project = v.project AND w.canvas = v.canvas AND w.screen = v.screen AND w.seq <= ?3)
     ORDER BY COALESCE((SELECT min(w.seq) FROM screen_versions w
                        WHERE w.project = v.project AND w.canvas = v.canvas AND w.screen = v.screen AND w.seq <= ?3
                          AND w.seq > COALESCE((SELECT max(r.seq) FROM screen_versions r WHERE r.project = v.project AND r.canvas = v.canvas
                                                AND r.screen = v.screen AND r.removed = 1 AND r.seq <= ?3), -1)), v.seq), v.screen`,
    project, canvas, seq,
  );
  const boxes = layoutScreens(rows);
  const enc = new TextEncoder();
  const screens = rows.map((r, i): AtScreen => ({ ...r, bytes: enc.encode(r.html).length, layout: { x: boxes[i].x, y: boxes[i].y } }));

  let start: string | null = null;
  let transition = "none";
  let ts: number | null = null;
  const events = sql.all<{ seq: number; ts: number; kind: string; payload: string }>(
    `SELECT seq, ts, kind, payload FROM events WHERE project = ? AND seq <= ? AND kind IN ${KINDS} AND json_extract(payload, '$.canvas') = ? ORDER BY seq`,
    project, seq, canvas,
  );
  for (const e of events) {
    const p = JSON.parse(e.payload);
    if (e.kind === "flow.set") {
      start = p.start_screen ?? null;
      transition = p.transition ?? "none";
    } else if (e.kind === "screen.removed" && p.id === start) start = null;
    if (e.seq === seq) ts = e.ts;
  }
  if (start !== null && !screens.some((s) => s.id === start)) start = null;
  return { canvas: { id: canvas, name: c.name }, seq, ts, screens, start_screen: start, transition };
}
