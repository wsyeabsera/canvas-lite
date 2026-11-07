import { test } from "node:test";
import assert from "node:assert/strict";
import { columnProgress, describeResults, describeVariants, keepSentence, percent, toneOf, traceLayout, variantEventHits, variantsLabel, walkSummary } from "../web/variants.ts";
import { describeEntries, stackVariants } from "../web/landing.ts";
import { parseRoute, routeProject } from "../web/state.ts";

const variants = { base: { id: "checkout", name: "Checkout", screens: 6, updated_at: 1 }, variants: [
  { id: "checkout-a", name: "One page", screens: 6, updated_at: 2, forked_from: { canvas: "checkout", seq: 412 } },
  { id: "checkout-b", name: "Stepper", screens: 7, updated_at: 3, forked_from: { canvas: "checkout", seq: 412 } },
  { id: "junk" }, 5,
], tournament: "t-1" };

test("describeVariants: base card, variant cards with tones and lines, skips junk, null when unreadable", () => {
  const m = describeVariants(variants)!;
  assert.deepEqual([m.base.line, m.base.tone, m.tournament], ["6 screens · the base", "base", "t-1"]);
  assert.deepEqual(m.variants.map((v) => [v.id, v.tone, v.line]), [["checkout-a", "a", "6 screens · forked at change 412"], ["checkout-b", "b", "7 screens · forked at change 412"], ["junk", "c", "no screens · forked at change 0"]]);
  assert.equal(describeVariants({ ...variants, tournament: null })!.tournament, null);
  for (const bad of [null, "x", {}, { base: {}, variants: [] }, { base: { id: "a" } }]) assert.equal(describeVariants(bad), null, String(bad));
  assert.deepEqual([toneOf(0), toneOf(3), variantsLabel(1), variantsLabel(4), keepSentence("Stepper", "Checkout")], ["a", "a", "1 variant", "4 variants", 'keep "Stepper" of Checkout']);
});

const cell = (canvas: string, goal_index: number, o: object) => ({ canvas, goal_index, runs: 3, finished: 3, reached: 3, avg_steps: 5, shortest: 5, avg_wrong_turns: 0, expectations: [], ...o });
const results = {
  tournament: "t-1", canvas: "checkout", goals: [{ goal: "buy", target: "Order confirmed" }, { goal: "change address", target: "Saved" }],
  canvases: [{ id: "checkout", name: "Checkout" }, { id: "checkout-a", name: "One page" }, { id: "checkout-b", name: "Stepper" }], runs: 3, progress: { done: 15, total: 18 }, complete: false,
  cells: [
    cell("checkout", 0, { avg_steps: 6, shortest: 5, avg_wrong_turns: 1 }), cell("checkout-a", 0, { avg_wrong_turns: 0.3 }), cell("checkout-b", 0, { expectations: ["I expected it on the summary"] }),
    cell("checkout", 1, { reached: 1, avg_steps: 9, shortest: 4, avg_wrong_turns: 4 }), cell("checkout-a", 1, { finished: 1, reached: 1 }), cell("checkout-b", 1, { finished: 0, reached: 0, avg_steps: null, avg_wrong_turns: null, shortest: null }),
  ],
  walks: [{ id: "w-1", canvas: "checkout-b", goal_index: 0, status: "reached" }, { id: "w-2", canvas: "checkout-b", goal_index: 1, status: "walking" }],
};

test("describeResults: cells read like the design, the best per goal is marked, ties mark no one, walks link finished cells only", () => {
  const m = describeResults(results)!;
  assert.deepEqual(m.columns.map((c) => c.tone), ["base", "a", "b"]);
  assert.deepEqual(m.rows[0].cells.map((c) => [c.text, c.tone, c.best]), [["3 of 3 reached", "ok", false], ["3 of 3 reached", "ok", false], ["3 of 3 reached", "ok", true]]);
  assert.equal(m.rows[0].cells[0].detail, "6 steps vs 5 shortest · 1 wrong turns");
  assert.deepEqual(m.rows[1].cells.map((c) => [c.text, c.tone, c.best]), [["1 of 3 reached", "bad", false], ["1 of 1 reached · 2 to go", "ok", true], ["No walks yet", "pending", false]]);
  assert.deepEqual(m.rows[0].cells.map((c) => c.walk), [null, null, "w-1"]);
  assert.equal(m.rows[1].cells[2].walk, null, "a walk still in progress has no trace yet");
  assert.deepEqual(m.quotes, [{ column: "Stepper", tone: "b", text: "I expected it on the summary" }]);
  assert.deepEqual([m.complete, m.progress], [false, { done: 15, total: 18 }]);
  const tie = describeResults({ ...results, cells: results.cells.map((c) => ({ ...c, avg_wrong_turns: 0, avg_steps: 5, reached: 3, finished: 3 })) })!;
  assert.deepEqual(tie.rows[0].cells.map((c) => c.best), [false, false, false]);
  for (const bad of [null, {}, { goals: [], canvases: [] }]) assert.equal(describeResults(bad), null);
  assert.deepEqual(columnProgress(results), [{ id: "checkout", done: 6, total: 6 }, { id: "checkout-a", done: 4, total: 6 }, { id: "checkout-b", done: 3, total: 6 }]);
  assert.deepEqual([percent(3, 6), percent(7, 6), percent(0, 0)], [50, 100, 0]);
});

test("traceLayout: visited screens and their neighbours in columns by distance, path edges green, wrong edges flagged", () => {
  const screens = [{ id: "cart", name: "Cart", links: ["help", "pay"] }, { id: "pay", name: "Pay", links: ["done"] }, { id: "done", name: "Done", links: [] }, { id: "help", name: "Help", links: ["cart"] }, { id: "far", name: "Far", links: [] }];
  const t = traceLayout(screens, [{ from: "cart", to: "help", wrong: true }, { from: "help", to: "cart", wrong: false }, { from: "cart", to: "pay", wrong: false }], "cart");
  assert.deepEqual(t.nodes.map((n) => [n.id, n.visited]).sort(), [["cart", true], ["done", false], ["help", true], ["pay", true]], "far is not drawn; done is one link away");
  const x = (id: string) => t.nodes.find((n) => n.id === id)!.x;
  assert.ok(x("cart") < x("pay") && x("pay") < x("done"));
  assert.deepEqual(t.edges.filter((e) => e.kind !== "link").map((e) => `${e.from}>${e.to}:${e.kind}`).sort(), ["cart>help:wrong", "cart>pay:path", "help>cart:path"]);
  assert.deepEqual(t.edges.filter((e) => e.kind === "link").map((e) => `${e.from}>${e.to}`), ["pay>done"]);
  assert.ok(t.width > 0 && t.height > 0);
  assert.deepEqual(traceLayout([], [], "x").nodes, []);
});

test("walk summary lines and which events refresh the variants pages", () => {
  assert.equal(walkSummary({ status: "reached", score: { steps: 4, shortest: 4, wrong_turns: 0 } }), "Reached in 4 steps (shortest 4) · 0 wrong turns");
  assert.equal(walkSummary({ status: "gave_up", score: { steps: 3, shortest: null, wrong_turns: 1 } }), "Gave up after 3 steps (no route to the goal) · 1 wrong turn");
  const r = { view: "variants", id: "tv", canvas: "c" } as const;
  assert.equal(variantEventHits(r, { project: "tv", kind: "walk.ended" }), true);
  assert.equal(variantEventHits(r, { project: "other", kind: "walk.ended" }), false);
  assert.equal(variantEventHits(r, { project: "tv", kind: "ping" }), false);
  assert.equal(variantEventHits({ view: "landing" }, { project: "tv", kind: "walk.ended" }), false);
});

test("the variants routes parse and belong to their project", () => {
  assert.deepEqual(parseRoute("#/project/tv/canvas/main/variants"), { view: "variants", id: "tv", canvas: "main" });
  assert.deepEqual(parseRoute("#/project/tv/canvas/main/tournament"), { view: "tournament", id: "tv", canvas: "main" });
  assert.deepEqual(parseRoute("#/project/tv/canvas/main/trace/w-1a2b"), { view: "trace", id: "tv", canvas: "main", walk: "w-1a2b" });
  assert.deepEqual(parseRoute("#/project/tv/canvas/Bad/variants"), { view: "activity" });
  assert.deepEqual(parseRoute("#/project/tv/canvas/main/trace/BAD ID"), { view: "activity" });
  assert.equal(routeProject({ view: "trace", id: "tv", canvas: "m", walk: "w" }), "tv");
});

test("the gallery stacks variants under their base and keeps a variant whose base is gone", () => {
  const e = (id: string, o: object = {}) => ({ pid: "tv", project: "TV", id, name: id, screens: 1, updated_at: 1, start_screen: null, dangling: 0, unlinked: 0, ...o });
  const list = [e("base"), e("v1", { forked_from: "base" }), e("v2", { forked_from: "base" }), e("orphan", { forked_from: "gone" }), e("other"), e("base", { pid: "x", project: "X" })];
  const out = stackVariants(list);
  assert.deepEqual(out.map((x) => [x.pid, x.id, x.variants]), [["tv", "base", 2], ["tv", "orphan", undefined], ["tv", "other", undefined], ["x", "base", undefined]]);
  assert.equal(describeEntries("tv", "TV", { canvases: [{ id: "v", forked_from: "base" }, { id: "b" }] })[0].forked_from, "base");
});
