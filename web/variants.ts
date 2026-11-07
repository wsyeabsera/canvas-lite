// Pure logic of the variants views (docs/variants.md): no DOM. variants-view.ts and tournament-view.ts draw what these return.
// Answers: `GET /api/projects/<id>/canvases/<cid>/variants`, `/tournaments/<tid>` and `/walks/<wid>`.
import { screensLabel } from "./canvas.ts";
import type { Route } from "./state.ts";

export type Tone = "base" | "a" | "b" | "c";
const TONES: Tone[] = ["a", "b", "c"];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

export type Card = { id: string; name: string; screens: number; line: string; tone: Tone; base: boolean };
export type VariantsModel = { base: Card; variants: Card[]; tournament: string | null };

/** Letter and colour by position: Variant A, B, C, then A's colour again (three tones are enough to tell neighbours apart). */
export const toneOf = (i: number): Tone => TONES[i % TONES.length];

export function describeVariants(api: unknown): VariantsModel | null {
  if (!isRecord(api) || !isRecord(api.base) || !Array.isArray(api.variants)) return null;
  const b = api.base;
  const base: Card = { id: str(b.id), name: str(b.name, str(b.id)), screens: num(b.screens), line: `${screensLabel(num(b.screens))} · the base`, tone: "base", base: true };
  const variants: Card[] = [];
  for (const v of api.variants) {
    if (!isRecord(v) || typeof v.id !== "string") continue;
    const f = isRecord(v.forked_from) ? num(v.forked_from.seq) : 0;
    variants.push({ id: v.id, name: str(v.name, v.id), screens: num(v.screens), line: `${screensLabel(num(v.screens))} · forked at change ${f}`, tone: toneOf(variants.length), base: false });
  }
  return base.id ? { base, variants, tournament: typeof api.tournament === "string" ? api.tournament : null } : null;
}

/** `4 variants` for the landing chip and the compare heading. */
export const variantsLabel = (n: number) => `${n} variant${n === 1 ? "" : "s"}`;

export const keepSentence = (variant: string, base: string) => `keep "${variant}" of ${base}`;
export const forkSentence = (base: string) => `fork ${base} into 3 variants and run a tournament`;

// --- tournament results ----------------------------------------------------------------------------

export type Cell = { text: string; detail: string; tone: "ok" | "bad" | "pending"; best: boolean; walk: string | null }; // walk: a finished walk to open as the trace
export type Column = { id: string; name: string; tone: Tone };
export type ResultsModel = {
  id: string; base: string; goals: { goal: string; target: string }[]; columns: Column[]; rows: { goal: string; cells: Cell[] }[];
  progress: { done: number; total: number }; complete: boolean; quotes: { column: string; tone: Tone; text: string }[];
};

type RawCell = { canvas: string; goal_index: number; runs: number; finished: number; reached: number; avg_steps: number | null; shortest: number | null; avg_wrong_turns: number | null; expectations: string[] };

function cellModel(c: RawCell): Cell {
  if (c.finished === 0) return { text: "No walks yet", detail: `${c.runs} planned`, tone: "pending", best: false, walk: null };
  const left = c.runs - c.finished;
  const text = `${c.reached} of ${c.finished} reached${left > 0 ? ` · ${left} to go` : ""}`;
  const detail = `${c.avg_steps ?? 0} steps vs ${c.shortest ?? "no route,"}${c.shortest === null ? "" : " shortest"} · ${c.avg_wrong_turns ?? 0} wrong turns`;
  return { text, detail, tone: c.reached === c.finished ? "ok" : "bad", best: false, walk: null };
}

/** Rank key of a finished cell: more goals reached, then fewer wrong turns, then fewer steps. Lower sorts better. */
const rank = (c: RawCell) => [-(c.reached / c.finished), c.avg_wrong_turns ?? 0, c.avg_steps ?? 0];

export function describeResults(api: unknown): ResultsModel | null {
  if (!isRecord(api) || !Array.isArray(api.goals) || !Array.isArray(api.canvases) || !Array.isArray(api.cells)) return null;
  const goals = api.goals.filter(isRecord).map((g) => ({ goal: str(g.goal), target: str(g.target) }));
  const columns: Column[] = api.canvases.filter(isRecord).map((c, i) => ({ id: str(c.id), name: i === 0 ? "Base" : str(c.name, str(c.id)), tone: i === 0 ? "base" : toneOf(i - 1) })); // the first column is always the base
  const cells = api.cells.filter(isRecord).map((c): RawCell => ({
    canvas: str(c.canvas), goal_index: num(c.goal_index), runs: num(c.runs), finished: num(c.finished), reached: num(c.reached),
    avg_steps: typeof c.avg_steps === "number" ? c.avg_steps : null, shortest: typeof c.shortest === "number" ? c.shortest : null,
    avg_wrong_turns: typeof c.avg_wrong_turns === "number" ? c.avg_wrong_turns : null, expectations: Array.isArray(c.expectations) ? c.expectations.filter((e): e is string => typeof e === "string") : [],
  }));
  const walks = (Array.isArray(api.walks) ? api.walks : []).filter(isRecord).map((w) => ({ id: str(w.id), canvas: str(w.canvas), goal_index: num(w.goal_index), status: str(w.status) }));
  const rows = goals.map((g, gi) => {
    const mine = columns.map((col) => cells.find((c) => c.canvas === col.id && c.goal_index === gi));
    const out = mine.map((c, i): Cell => ({ ...(c ? cellModel(c) : { text: "No walks yet", detail: "", tone: "pending" as const, best: false, walk: null }), walk: walks.find((w) => w.canvas === columns[i].id && w.goal_index === gi && w.status !== "walking")?.id ?? null }));
    const done = mine.filter((c): c is RawCell => !!c && c.finished > 0);
    if (done.length > 1) {
      const key = (c: RawCell) => rank(c).join("|");
      const sorted = done.map(rank).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      const top = sorted[0].join("|");
      const winners = done.filter((c) => key(c) === top);
      if (winners.length < done.length) mine.forEach((c, i) => { if (c && winners.includes(c)) out[i].best = true; }); // a tie among everyone highlights no one
    }
    return { goal: g.goal, cells: out };
  });
  const quotes = columns.flatMap((col) => cells.filter((c) => c.canvas === col.id).flatMap((c) => c.expectations.slice(0, 1).map((text) => ({ column: col.name, tone: col.tone, text })))).slice(0, 4);
  const p = isRecord(api.progress) ? api.progress : {};
  return { id: str(api.tournament), base: str(api.canvas), goals, columns, rows, progress: { done: num(p.done), total: num(p.total) }, complete: api.complete === true, quotes, };
}

/** Whole-number percent of walks done, for the progress bars. */
export const percent = (done: number, total: number) => (total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0);

/** Progress per column: finished walks of all its goals over planned walks. */
export function columnProgress(api: unknown): { id: string; done: number; total: number }[] {
  if (!isRecord(api) || !Array.isArray(api.cells)) return [];
  const by = new Map<string, { done: number; total: number }>();
  for (const c of api.cells.filter(isRecord)) {
    const e = by.get(str(c.canvas)) ?? { done: 0, total: 0 };
    e.done += Math.min(num(c.finished), num(c.runs));
    e.total += num(c.runs);
    by.set(str(c.canvas), e);
  }
  return [...by].map(([id, v]) => ({ id, ...v }));
}

// --- walk trace ------------------------------------------------------------------------------------

export type TraceNode = { id: string; name: string; x: number; y: number; visited: boolean };
export type TraceEdge = { from: string; to: string; kind: "path" | "wrong" | "link" };
export type Trace = { nodes: TraceNode[]; edges: TraceEdge[]; width: number; height: number };
export const NODE_W = 200;
export const NODE_H = 48;
const GAP_X = 90;
const GAP_Y = 24;
const MAX_NODES = 14;

/** The screens a walk touched and the screens one link away, laid out in columns by distance from where it started. */
export function traceLayout(screens: { id: string; name: string; links: string[] }[], steps: { from: string; to: string; wrong: boolean }[], start: string): Trace {
  const by = new Map(screens.map((s) => [s.id, s]));
  const visited = new Set([start, ...steps.flatMap((s) => [s.from, s.to])]);
  const keep = new Set([...visited].filter((id) => by.has(id)));
  for (const id of [...keep]) for (const to of by.get(id)!.links) if (by.has(to) && keep.size < MAX_NODES) keep.add(to);
  const depth = new Map<string, number>(by.has(start) ? [[start, 0]] : []);
  const queue = [...depth.keys()];
  for (let i = 0; i < queue.length; i++) for (const to of by.get(queue[i])?.links ?? []) if (keep.has(to) && !depth.has(to)) { depth.set(to, depth.get(queue[i])! + 1); queue.push(to); }
  const cols = new Map<number, string[]>();
  for (const id of keep) { const d = depth.get(id) ?? Math.max(0, ...depth.values()) + 1; cols.set(d, [...(cols.get(d) ?? []), id]); }
  const nodes: TraceNode[] = [];
  for (const [d, ids] of [...cols].sort((a, b) => a[0] - b[0])) ids.forEach((id, row) => nodes.push({ id, name: by.get(id)!.name, x: 40 + d * (NODE_W + GAP_X), y: 40 + row * (NODE_H + GAP_Y), visited: visited.has(id) }));
  const path = new Map(steps.map((s) => [`${s.from}>${s.to}`, s.wrong]));
  const edges: TraceEdge[] = [];
  for (const [k, wrong] of path) { const [from, to] = k.split(">"); if (keep.has(from) && keep.has(to)) edges.push({ from, to, kind: wrong ? "wrong" : "path" }); }
  for (const id of keep) for (const to of by.get(id)!.links) if (keep.has(to) && !path.has(`${id}>${to}`) && !path.has(`${to}>${id}`)) edges.push({ from: id, to, kind: "link" });
  return { nodes, edges, width: Math.max(...nodes.map((n) => n.x + NODE_W), 0) + 40, height: Math.max(...nodes.map((n) => n.y + NODE_H), 0) + 40 };
}

/** One line of a walk's result: `Reached in 4 steps (shortest 4) · 0 wrong turns`. */
export function walkSummary(w: { status: string; score: { steps: number; shortest: number | null; wrong_turns: number } }): string {
  const s = w.score;
  const how = w.status === "reached" ? `Reached in ${s.steps} steps` : w.status === "gave_up" ? `Gave up after ${s.steps} steps` : `Still walking, ${s.steps} steps`;
  return `${how}${s.shortest === null ? " (no route to the goal)" : ` (shortest ${s.shortest})`} · ${s.wrong_turns} wrong turn${s.wrong_turns === 1 ? "" : "s"}`;
}

/** Events that change a variants page: forks, merges, canvas edits and tournament walks of the project on show. */
export const VARIANT_EVENTS = ["canvas.forked", "variant.merged", "canvas.created", "canvas.removed", "screen.set", "screen.removed", "tournament.started", "walk.started", "walk.step", "walk.ended"];
export const variantEventHits = (route: Route, row: { project: string | null; kind: string }): boolean =>
  (route.view === "variants" || route.view === "tournament" || route.view === "trace") && row.project === route.id && VARIANT_EVENTS.includes(row.kind);
