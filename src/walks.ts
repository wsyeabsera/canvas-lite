// Blind walks (docs/variants.md): one synthetic user, one goal, one canvas. The user is a fresh Claude subagent that sees only what `seen`
// returns. Pure functions over `Sql`; the score is computed on read from the stored path, never stored. Events carry no screen content.
import { checkId, requireCanvas, requireProject } from "./canvases.ts";
import { effectiveStart } from "./flow.ts";
import { appendEvent, type LiteEvent, type Sql } from "./store.ts";
import { deadScreens, distances, reachedGoal, scoreWalk, seen, type Choice, type Score } from "./walk-score.ts";

export const MAX_STEPS = 25;
export const GOAL_MAX = 200;
export const TARGET_MAX = 100;
export const NOTE_MAX = 300;

export const WALK_TEXT = {
  walk_start:
    "Start a blind walk: you play a user who has never seen this design. You are told only the goal, never the screen ids or the design's intent, and each screen shows only its visible text and the numbered labels of its links. Standalone: give canvas, goal (what the user wants, in plain words) and target (text that appears on the screen where the goal is done, such as \"Order confirmed\"). In a tournament: give tournament, canvas and goal_index. Run this as a FRESH subagent with no other context, or the result means nothing. Answer {walk, goal, view: {text, choices: [{n, label}]}}.",
  walk_step:
    `Take one step of a blind walk: choice is the number of a link in the current view, or give_up: true when you cannot find a way. note is optional: say in one sentence what you expected here (at most ${NOTE_MAX} characters); the last note is kept. The walk ends when the goal text appears (reached), on give_up, or after ${MAX_STEPS} steps. Answer {status: "walking", view} while it goes on, or {status: "reached" | "gave_up", score: {steps, shortest, wrong_turns, dead_ends, reached}}.`,
  read_walk: "Read a walk and its score: {walk, canvas, goal, status, path, steps: [{from, to, label, wrong}], note, score}. The target text is left out on purpose.",
} as const;

export type WalkStatus = "walking" | "reached" | "gave_up";
export type Step = { from: string; to: string; label: string; back?: boolean };
type Row = { id: string; tournament: string | null; canvas: string; goal_index: number | null; goal: string; target: string; status: WalkStatus; path: string; steps: string; note: string; snapshot: string; started_at: number; ended_at: number | null };
export type View = { text: string; choices: { n: number; label: string }[] };
export type WalkRead = { walk: string; tournament: string | null; canvas: string; goal_index: number | null; goal: string; target: string; status: WalkStatus; path: string[]; steps: (Step & { wrong: boolean })[]; note: string; started_at: number; ended_at: number | null; score: Score };

const screensOf = (sql: Sql, project: string, canvas: string) => sql.all<{ id: string; name: string; html: string }>("SELECT id, name, html FROM screens WHERE project = ? AND canvas = ? ORDER BY rowid", project, canvas);

function viewOf(html: string, hasPrev: boolean): { view: View; choices: Choice[] } {
  const s = seen(html);
  const choices = s.choices.filter((c) => c.to !== null || hasPrev);
  return { view: { text: s.text, choices: choices.map((c, i) => ({ n: i + 1, label: c.label })) }, choices };
}

function getRow(sql: Sql, project: string, walk: string): Row {
  checkId("canvas", walk); // walk ids are slugs too
  const [r] = sql.all<Row>("SELECT id, tournament, canvas, goal_index, goal, target, status, path, steps, note, snapshot, started_at, ended_at FROM walks WHERE project = ? AND id = ?", project, walk);
  if (!r) throw new Error(`unknown walk "${walk}"`);
  return r;
}

/** What a walk is scored against, fixed when it starts so a later edit or merge never re-scores it: distances to the goal and the screens with no way on. */
type Snapshot = { dist: [string, number][]; dead: string[] };
const snapshotOf = (screens: { id: string; html: string }[], target: string): Snapshot => ({ dist: [...distances(screens, target)], dead: deadScreens(screens) });

/** The screens a walk can still go back to: a stack, so back goes to where you were before the screen you left. */
function backStack(start: string, steps: Step[]): string[] {
  const stack = [start];
  for (const s of steps) {
    if (s.back) stack.pop();
    else stack.push(s.to);
  }
  return stack;
}

function build(sql: Sql, project: string, r: Row): WalkRead {
  const path = JSON.parse(r.path) as string[];
  const snap: Snapshot = r.snapshot !== "null" ? JSON.parse(r.snapshot) : snapshotOf(screensOf(sql, project, r.canvas), r.target); // rows from before snapshots score live
  const dist = new Map(snap.dist);
  // A step is wrong when it ends farther from the goal than it began (the same rule scoreWalk counts), so the trace can draw it.
  const steps = (JSON.parse(r.steps) as Step[]).map((s) => {
    const a = dist.get(s.from);
    const b = dist.get(s.to);
    return { ...s, wrong: a !== undefined && (b === undefined || b > a) };
  });
  return {
    walk: r.id, tournament: r.tournament, canvas: r.canvas, goal_index: r.goal_index, goal: r.goal, target: r.target, status: r.status, path, steps, note: r.note,
    started_at: r.started_at, ended_at: r.ended_at, score: scoreWalk(path, dist, new Set(snap.dead), r.status === "reached"),
  };
}

/** A walk as shown to a blind user: without the target text, which would tell them how the goal is worded. The watch page's trace uses `readWalk`. */
export const blindWalk = ({ target: _target, ...rest }: WalkRead): Omit<WalkRead, "target"> => rest;

export function readWalk(sql: Sql, project: string, walk: string): WalkRead {
  requireProject(sql, project);
  return build(sql, project, getRow(sql, project, walk));
}

/** Starts a walk on a canvas at its start screen. Tournament walks take goal and target from the tournament (see src/tournament.ts). */
export function startWalk(
  sql: Sql, project: string, input: { canvas: string; goal: string; target: string; tournament?: string; goal_index?: number }, now = Date.now(),
): { walk: string; goal: string; view: View; status: WalkStatus; events: LiteEvent[] } {
  requireProject(sql, project);
  if (typeof input.goal !== "string" || input.goal.trim() === "" || input.goal.length > GOAL_MAX) throw new Error(`invalid goal: use 1 to ${GOAL_MAX} characters`);
  if (typeof input.target !== "string" || input.target.trim() === "" || input.target.length > TARGET_MAX) throw new Error(`invalid target: use 1 to ${TARGET_MAX} characters of text that shows the goal is done`);
  return sql.transaction(() => {
    requireCanvas(sql, project, input.canvas);
    const screens = screensOf(sql, project, input.canvas);
    const c = sql.all<{ start_screen: string | null }>("SELECT start_screen FROM canvases WHERE project = ? AND id = ?", project, input.canvas)[0];
    const start = effectiveStart(c.start_screen, screens.map((s) => s.id));
    if (start === null) throw new Error(`canvas "${input.canvas}" has no screens to walk`);
    const id = `w-${crypto.randomUUID().slice(0, 8)}`;
    const first = screens.find((s) => s.id === start)!;
    const reached = reachedGoal(first.html, input.target);
    const status: WalkStatus = reached ? "reached" : "walking";
    sql.run(
      "INSERT INTO walks (project, id, tournament, canvas, goal_index, goal, target, status, path, steps, note, snapshot, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '', ?, ?, ?)",
      project, id, input.tournament ?? null, input.canvas, input.goal_index ?? null, input.goal, input.target, status, JSON.stringify([start]), JSON.stringify(snapshotOf(screens, input.target)), now, reached ? now : null,
    );
    const events = [appendEvent(sql, { project, kind: "walk.started", payload: { walk: id, canvas: input.canvas, tournament: input.tournament ?? null } }, now)];
    if (reached) events.push(appendEvent(sql, { project, kind: "walk.ended", payload: { walk: id, canvas: input.canvas, tournament: input.tournament ?? null, status } }, now));
    return { walk: id, goal: input.goal, view: viewOf(first.html, false).view, status, events };
  });
}

export type StepResult = { walk: string; status: WalkStatus; view?: View; score?: Score; events: LiteEvent[] };

/** One step: follow choice `n` of the current view, or give up. Ends on the goal text, on give_up, or after MAX_STEPS moves. */
export function stepWalk(sql: Sql, project: string, walk: string, input: { choice?: number; give_up?: boolean; note?: string }, now = Date.now()): StepResult {
  requireProject(sql, project);
  if (input.note !== undefined && (typeof input.note !== "string" || input.note.length > NOTE_MAX)) throw new Error(`invalid note: use at most ${NOTE_MAX} characters`);
  return sql.transaction(() => {
    const r = getRow(sql, project, walk);
    if (r.status !== "walking") throw new Error(`walk "${walk}" is already over (${r.status})`);
    const screens = screensOf(sql, project, r.canvas);
    const path = JSON.parse(r.path) as string[];
    const steps = JSON.parse(r.steps) as Step[];
    const cur = screens.find((s) => s.id === path[path.length - 1]);
    const note = input.note ?? r.note;
    const meta = { walk, canvas: r.canvas, tournament: r.tournament };
    const events: LiteEvent[] = [];
    const finish = (status: WalkStatus) => {
      sql.run("UPDATE walks SET status = ?, path = ?, steps = ?, note = ?, ended_at = ? WHERE project = ? AND id = ?", status, JSON.stringify(path), JSON.stringify(steps), note, now, project, walk);
      events.push(appendEvent(sql, { project, kind: "walk.ended", payload: { ...meta, status } }, now));
      return { walk, status, score: build(sql, project, getRow(sql, project, walk)).score, events } satisfies StepResult;
    };
    if (input.give_up === true) return finish("gave_up");
    if (!cur) throw new Error(`the screen "${path[path.length - 1]}" no longer exists: start a new walk`);
    const stack = backStack(path[0], steps);
    const { choices } = viewOf(cur.html, stack.length > 1);
    const n = input.choice;
    if (!Number.isInteger(n) || n! < 1 || n! > choices.length) throw new Error(`invalid choice: use a number from 1 to ${choices.length}, or give_up: true`);
    const c = choices[n! - 1];
    const to = c.to ?? stack[stack.length - 2];
    const next = screens.find((s) => s.id === to);
    if (!next) throw new Error(`that link leads nowhere: choose another, or give_up: true`);
    path.push(to);
    steps.push({ from: cur.id, to, label: c.label, ...(c.to === null && { back: true }) });
    events.push(appendEvent(sql, { project, kind: "walk.step", payload: { ...meta, n: steps.length } }, now));
    if (reachedGoal(next.html, r.target)) return finish("reached");
    if (steps.length >= MAX_STEPS) return finish("gave_up");
    sql.run("UPDATE walks SET path = ?, steps = ?, note = ? WHERE project = ? AND id = ?", JSON.stringify(path), JSON.stringify(steps), note, project, walk);
    return { walk, status: "walking" as const, view: viewOf(next.html, backStack(path[0], steps).length > 1).view, events };
  });
}
