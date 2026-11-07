// Blind walks and tournaments end to end without the Hub: the same functions the Hub calls, on an in-memory db.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas, setFlow, setScreens } from "../src/canvases.ts";
import { forkCanvas } from "../src/variants.ts";
import { MAX_STEPS, readWalk, startWalk, stepWalk } from "../src/walks.ts";
import { startTournament, startTournamentWalk, tournamentResults, tournamentSlot } from "../src/tournament.ts";
import { listVariants } from "../src/variants.ts";
import { openProject } from "../src/projects.ts";
import { migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const page = (body: string) => ({ width: 400, height: 300, html: `<body>${body}</body>` });
const sql = nodeSql();
migrate(sql);
openProject(sql, { name: "shop", manifest: { tree: [], files: {} } }, 1);
createCanvas(sql, "shop", { name: "Checkout", id: "checkout" });
setScreens(sql, "shop", "checkout", [
  { id: "cart", name: "Cart", ...page("<h1>Cart</h1><div data-to='help'>Help</div><div data-to='pay'>Continue</div>") },
  { id: "pay", name: "Pay", ...page("<div data-to='done'>Confirm</div><a data-back>Back</a>") },
  { id: "done", name: "Done", ...page("Order confirmed") },
  { id: "help", name: "Help", ...page("Questions <a data-back>Back</a>") },
]);
setFlow(sql, "shop", "checkout", { start_screen: "cart" });
const goal = { canvas: "checkout", goal: "buy a ticket", target: "Order confirmed" };

test("a walk shows the user only text and numbered labels, never ids", () => {
  const w = startWalk(sql, "shop", goal, 10);
  assert.equal(w.status, "walking");
  assert.deepEqual(w.view, { text: "Cart Help Continue", choices: [{ n: 1, label: "Help" }, { n: 2, label: "Continue" }] });
  const { events: _events, ...told } = w; // what the Hub returns to the user: no events
  assert.ok(!/\bpay\b|\bcart\b/.test(JSON.stringify(told)), "no screen id reaches the user");
  assert.deepEqual(w.events.map((e) => e.kind), ["walk.started"]);
});

test("a walk with one wrong turn is scored and ends when the goal text appears", () => {
  const w = startWalk(sql, "shop", goal, 10);
  const a = stepWalk(sql, "shop", w.walk, { choice: 1, note: "I hoped help would start checkout" }, 11);
  assert.equal(a.status, "walking");
  assert.deepEqual(a.view!.choices, [{ n: 1, label: "Back" }]);
  stepWalk(sql, "shop", w.walk, { choice: 1 }, 12); // Back to the cart
  stepWalk(sql, "shop", w.walk, { choice: 2 }, 13);
  const end = stepWalk(sql, "shop", w.walk, { choice: 1 }, 14);
  assert.equal(end.status, "reached");
  assert.deepEqual(end.score, { steps: 4, shortest: 2, wrong_turns: 1, dead_ends: 0, reached: true });
  assert.deepEqual(end.events.map((e) => e.kind), ["walk.step", "walk.ended"]);
  const r = readWalk(sql, "shop", w.walk);
  assert.deepEqual([r.path, r.note, r.ended_at], [["cart", "help", "cart", "pay", "done"], "I hoped help would start checkout", 14]);
  assert.deepEqual(r.steps[0], { from: "cart", to: "help", label: "Help", wrong: true });
  assert.deepEqual(r.steps.map((s) => s.wrong), [true, false, false, false], "only leaving the way to the goal is wrong; coming back is not");
});

test("giving up, bad choices and finished walks", () => {
  const w = startWalk(sql, "shop", goal, 20);
  assert.throws(() => stepWalk(sql, "shop", w.walk, { choice: 9 }), /use a number from 1 to 2/);
  assert.throws(() => stepWalk(sql, "shop", w.walk, {}), /invalid choice/);
  assert.throws(() => stepWalk(sql, "shop", w.walk, { choice: 1, note: "x".repeat(301) }), /invalid note/);
  const g = stepWalk(sql, "shop", w.walk, { give_up: true });
  assert.deepEqual([g.status, g.score!.reached, g.score!.steps], ["gave_up", false, 0]);
  assert.throws(() => stepWalk(sql, "shop", w.walk, { choice: 1 }), /already over \(gave_up\)/);
  assert.throws(() => readWalk(sql, "shop", "w-nope"), /unknown walk/);
});

test("a goal already on the start screen is reached at once; the step limit ends a wandering walk", () => {
  assert.equal(startWalk(sql, "shop", { ...goal, target: "cart" }).status, "reached");
  const w = startWalk(sql, "shop", goal);
  let r = stepWalk(sql, "shop", w.walk, { choice: 1 });
  for (let i = 1; i < MAX_STEPS; i++) r = stepWalk(sql, "shop", w.walk, { choice: 1 });
  assert.equal(r.status, "gave_up");
  assert.equal(readWalk(sql, "shop", w.walk).steps.length, MAX_STEPS);
});

test("start errors: bad goal and target, unknown canvas, empty canvas", () => {
  assert.throws(() => startWalk(sql, "shop", { ...goal, goal: "" }), /invalid goal/);
  assert.throws(() => startWalk(sql, "shop", { ...goal, target: " " }), /invalid target/);
  assert.throws(() => startWalk(sql, "shop", { ...goal, canvas: "gone" }), /unknown canvas/);
  createCanvas(sql, "shop", { name: "Empty", id: "empty" });
  assert.throws(() => startWalk(sql, "shop", { ...goal, canvas: "empty" }), /no screens to walk/);
});

test("a tournament walks the same goals on the base and every variant, three runs each, and scores each cell", () => {
  const a = forkCanvas(sql, "shop", { canvas: "checkout", name: "Short" }, 30).canvas.id;
  setScreens(sql, "shop", a, [{ id: "cart", name: "Cart", ...page("<div data-to='done'>Buy</div>") }], 31);
  assert.throws(() => startTournament(sql, "shop", { canvas: "checkout", goals: [], runs: 1 }), /1 to 6 goals/);
  assert.throws(() => startTournament(sql, "shop", { canvas: "checkout", goals: [{ goal: "g", target: "t" }], runs: 9 }), /invalid runs/);
  assert.throws(() => startTournament(sql, "shop", { canvas: "checkout", goals: [{ goal: "g", target: "t" }], canvases: ["checkout"] }), /at least two/);
  assert.throws(() => startTournament(sql, "shop", { canvas: "checkout", goals: [{ goal: "g", target: "t" }], canvases: ["checkout", "empty"] }), /not the base or a variant/);
  const t = startTournament(sql, "shop", { canvas: "checkout", goals: [{ goal: "buy a ticket", target: "Order confirmed" }], runs: 2 }, 32);
  assert.equal(t.plan.length, (1 + 1) * 1 * 2 + 0 * 0 + (listVariants(sql, "shop", "checkout").variants.length - 1) * 2);
  assert.deepEqual(t.plan.slice(0, 2), [{ canvas: "checkout", goal_index: 0, run: 1 }, { canvas: "checkout", goal_index: 0, run: 2 }]);
  assert.equal(listVariants(sql, "shop", "checkout").tournament, t.tournament);
  assert.deepEqual(tournamentSlot(sql, "shop", t.tournament, a, 0), { goal: "buy a ticket", target: "Order confirmed" });
  assert.throws(() => tournamentSlot(sql, "shop", t.tournament, "empty", 0), /not part of/);
  assert.throws(() => tournamentSlot(sql, "shop", t.tournament, a, 5), /invalid goal_index/);
  const run = (canvas: string, choices: number[]) => {
    const w = startTournamentWalk(sql, "shop", { tournament: t.tournament, canvas, goal_index: 0 });
    for (const c of choices) stepWalk(sql, "shop", w.walk, { choice: c, note: `on ${canvas}` });
    return w.walk;
  };
  run(a, [1]);
  assert.equal(tournamentResults(sql, "shop", t.tournament).complete, false);
  run(a, [1]);
  run("checkout", [2, 1]);
  assert.throws(() => run(a, [1]), /all 2 runs of goal 0 on "checkout-short" are taken/);
  const mid = tournamentResults(sql, "shop", t.tournament);
  assert.deepEqual(mid.progress.done < mid.progress.total, true);
  for (const v of listVariants(sql, "shop", "checkout").variants.filter((x) => x.id !== a)) { run(v.id, [2, 1]); run(v.id, [2, 1]); }
  run("checkout", [1, 1, 2, 1]);
  const r = tournamentResults(sql, "shop", t.tournament);
  assert.equal(r.complete, true);
  const cell = (c: string) => r.cells.find((x) => x.canvas === c)!;
  assert.deepEqual([cell(a).reached, cell(a).avg_steps, cell(a).shortest, cell(a).avg_wrong_turns], [2, 1, 1, 0]);
  assert.deepEqual([cell("checkout").reached, cell("checkout").avg_steps, cell("checkout").avg_wrong_turns], [2, 3, 0.5]);
  assert.deepEqual(cell(a).expectations, [`on ${a}`, `on ${a}`]);
  assert.deepEqual(r.canvases.map((c) => c.id)[0], "checkout");
  assert.throws(() => tournamentResults(sql, "shop", "t-nope"), /unknown tournament/);
});
