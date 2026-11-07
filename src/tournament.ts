// Tournaments (docs/variants.md): the same goals walked by blind users on every variant of a base, several times each. Pure functions over
// `Sql`. Goals and the list of canvases are fixed when it starts, so no variant is judged by goals written after seeing it.
import { checkId, requireCanvas, requireProject } from "./canvases.ts";
import { appendEvent, type LiteEvent, type Sql } from "./store.ts";
import { listVariants } from "./variants.ts";
import { GOAL_MAX, TARGET_MAX, readWalk, startWalk, type WalkRead } from "./walks.ts";

export const GOALS_MAX = 6;
export const RUNS_MAX = 5;
export const RUNS_DEFAULT = 3;

export const TOURNAMENT_TEXT = {
  tournament_start:
    `Start a tournament on a base canvas: the same goals, walked by blind users on the base and every variant (or only the canvases you list). goals: 1 to ${GOALS_MAX} of {goal, target}: goal is what a user wants in plain words, target is text that appears on the screen where it is done. runs: walks per goal and canvas, 1 to ${RUNS_MAX}, default ${RUNS_DEFAULT}. Write the goals BEFORE you make the variants and do not change them. Answer {tournament, runs, goals, plan: [{canvas, goal_index, run}]}: then run each plan item as its own fresh subagent with walk_start (tournament, canvas, goal_index) and walk_step, never reusing a subagent, and finish with tournament_results.`,
  tournament_results:
    "Read a tournament: {tournament, canvas, goals, canvases: [{id, name}], progress: {done, total}, complete, cells: [{canvas, goal_index, runs, finished, reached, avg_steps, shortest, avg_wrong_turns, dead_ends, expectations}], walks: [{id, canvas, goal_index, status}]}. Averages are over finished walks. These are simulated users: report the result as a signal, not proof, and never pick the winner yourself: show it to the owner.",
} as const;

export type Goal = { goal: string; target: string };
export type Cell = { canvas: string; goal_index: number; runs: number; finished: number; reached: number; avg_steps: number | null; shortest: number | null; avg_wrong_turns: number | null; dead_ends: number; expectations: string[] };
export type Results = { tournament: string; canvas: string; goals: Goal[]; canvases: { id: string; name: string }[]; runs: number; progress: { done: number; total: number }; complete: boolean; cells: Cell[]; walks: { id: string; canvas: string; goal_index: number; status: string }[] };
type Row = { id: string; canvas: string; goals: string; runs: number; canvases: string };

function checkGoals(goals: unknown): Goal[] {
  if (!Array.isArray(goals) || goals.length < 1 || goals.length > GOALS_MAX) throw new Error(`invalid goals: use 1 to ${GOALS_MAX} goals`);
  return goals.map((g, i) => {
    if (typeof g?.goal !== "string" || g.goal.trim() === "" || g.goal.length > GOAL_MAX) throw new Error(`invalid goals[${i}].goal: use 1 to ${GOAL_MAX} characters`);
    if (typeof g?.target !== "string" || g.target.trim() === "" || g.target.length > TARGET_MAX) throw new Error(`invalid goals[${i}].target: use 1 to ${TARGET_MAX} characters`);
    return { goal: g.goal, target: g.target };
  });
}

export function getTournament(sql: Sql, project: string, id: string): Row {
  checkId("canvas", id);
  const [r] = sql.all<Row>("SELECT id, canvas, goals, runs, canvases FROM tournaments WHERE project = ? AND id = ?", project, id);
  if (!r) throw new Error(`unknown tournament "${id}"`);
  return r;
}

export function startTournament(
  sql: Sql, project: string, input: { canvas: string; goals: unknown; runs?: number; canvases?: string[] }, now = Date.now(),
): { tournament: string; runs: number; goals: Goal[]; plan: { canvas: string; goal_index: number; run: number }[]; event: LiteEvent } {
  requireProject(sql, project);
  const goals = checkGoals(input.goals);
  const runs = input.runs ?? RUNS_DEFAULT;
  if (!Number.isInteger(runs) || runs < 1 || runs > RUNS_MAX) throw new Error(`invalid runs: use 1 to ${RUNS_MAX}`);
  return sql.transaction(() => {
    requireCanvas(sql, project, input.canvas);
    const v = listVariants(sql, project, input.canvas);
    const all = [v.base.id, ...v.variants.map((x) => x.id)];
    const canvases = input.canvases ?? all;
    if (canvases.length < 2) throw new Error("a tournament needs at least two canvases: fork variants first");
    for (const c of canvases) if (!all.includes(c)) throw new Error(`canvas "${c}" is not the base or a variant of "${v.base.id}"`);
    const id = `t-${crypto.randomUUID().slice(0, 8)}`;
    sql.run("INSERT INTO tournaments (project, id, canvas, goals, runs, canvases, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", project, id, v.base.id, JSON.stringify(goals), runs, JSON.stringify(canvases), now);
    const event = appendEvent(sql, { project, kind: "tournament.started", payload: { tournament: id, canvas: v.base.id, runs, goals: goals.length, canvases } }, now);
    const plan = canvases.flatMap((canvas) => goals.flatMap((_, goal_index) => Array.from({ length: runs }, (_, run) => ({ canvas, goal_index, run: run + 1 }))));
    return { tournament: id, runs, goals, plan, event };
  });
}

/** Takes goal and target for a tournament walk and checks the pairing still has a free run. */
export function tournamentSlot(sql: Sql, project: string, tournament: string, canvas: string, goalIndex: number): { goal: string; target: string } {
  const t = getTournament(sql, project, tournament);
  const goals = JSON.parse(t.goals) as Goal[];
  if (!(JSON.parse(t.canvases) as string[]).includes(canvas)) throw new Error(`canvas "${canvas}" is not part of tournament "${tournament}"`);
  if (!Number.isInteger(goalIndex) || goalIndex < 0 || goalIndex >= goals.length) throw new Error(`invalid goal_index: use 0 to ${goals.length - 1}`);
  const taken = sql.all<{ n: number }>("SELECT count(*) AS n FROM walks WHERE project = ? AND tournament = ? AND canvas = ? AND goal_index = ?", project, tournament, canvas, goalIndex)[0].n;
  if (taken >= t.runs) throw new Error(`all ${t.runs} runs of goal ${goalIndex} on "${canvas}" are taken`);
  return goals[goalIndex];
}

/** A tournament walk: goal and target come from the tournament, and the pairing must still have a free run. */
export function startTournamentWalk(sql: Sql, project: string, input: { tournament: string; canvas: string; goal_index: number }, now = Date.now()) {
  requireProject(sql, project);
  const s = tournamentSlot(sql, project, input.tournament, input.canvas, input.goal_index);
  return startWalk(sql, project, { canvas: input.canvas, goal: s.goal, target: s.target, tournament: input.tournament, goal_index: input.goal_index }, now);
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function tournamentResults(sql: Sql, project: string, id: string): Results {
  requireProject(sql, project);
  const t = getTournament(sql, project, id);
  const goals = JSON.parse(t.goals) as Goal[];
  const canvases = JSON.parse(t.canvases) as string[];
  const walks = sql.all<{ id: string }>("SELECT id FROM walks WHERE project = ? AND tournament = ? ORDER BY started_at, rowid", project, id).map((w) => readWalk(sql, project, w.id));
  const names = new Map(sql.all<{ id: string; name: string }>("SELECT id, name FROM canvases WHERE project = ?", project).map((c) => [c.id, c.name]));
  const cells: Cell[] = canvases.flatMap((canvas) =>
    goals.map((_, goal_index): Cell => {
      const mine: WalkRead[] = walks.filter((w) => w.canvas === canvas && w.goal_index === goal_index);
      const done = mine.filter((w) => w.status !== "walking");
      return {
        canvas, goal_index, runs: t.runs, finished: done.length, reached: done.filter((w) => w.status === "reached").length,
        avg_steps: mean(done.map((w) => w.score.steps)), shortest: done[0]?.score.shortest ?? null, avg_wrong_turns: mean(done.map((w) => w.score.wrong_turns)),
        dead_ends: done.reduce((n, w) => n + w.score.dead_ends, 0), expectations: done.map((w) => w.note).filter(Boolean),
      };
    }),
  );
  const total = canvases.length * goals.length * t.runs;
  const finished = cells.reduce((n, c) => n + c.finished, 0);
  return { tournament: id, canvas: t.canvas, goals, canvases: canvases.map((c) => ({ id: c, name: names.get(c) ?? c })), runs: t.runs, progress: { done: finished, total }, complete: finished >= total, cells,
    walks: walks.map((w) => ({ id: w.walk, canvas: w.canvas, goal_index: w.goal_index ?? 0, status: w.status })) };
}
