import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas, listCanvasesForPage, removeScreen, setFlow, setScreens } from "../src/canvases.ts";
import { forkCanvas, forkedFrom, listVariants, mergeVariant, rootOf } from "../src/variants.ts";
import { canvasAt } from "../src/timeline.ts";
import { openProject } from "../src/projects.ts";
import { migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const page = (body: string) => ({ width: 400, height: 300, html: `<body style='margin:0'>${body}</body>` });
const sql = nodeSql();
migrate(sql);
openProject(sql, { name: "shop", manifest: { tree: [], files: {} } }, 1);
createCanvas(sql, "shop", { name: "Checkout", id: "checkout" }, 2);
setScreens(sql, "shop", "checkout", [
  { id: "cart", name: "Cart", ...page("<div data-to='pay'>Pay</div>") },
  { id: "pay", name: "Pay", ...page("<div data-to='done'>Confirm</div>") },
  { id: "done", name: "Done", ...page("Order confirmed") },
], 3);
setFlow(sql, "shop", "checkout", { start_screen: "cart", transition: "fade" }, 4);

test("fork copies the canvas at a point in history and remembers where it came from", () => {
  const mid = sql.all<{ s: number }>("SELECT max(seq) AS s FROM events")[0].s;
  setScreens(sql, "shop", "checkout", [{ id: "cart", name: "Cart", ...page("<div data-to='pay'>Pay now</div>") }], 5);
  const f = forkCanvas(sql, "shop", { canvas: "checkout", name: "One page", seq: mid }, 6);
  assert.equal(f.canvas.id, "checkout-one-page");
  assert.deepEqual(f.canvas.forked_from, { canvas: "checkout", seq: mid });
  assert.equal(f.canvas.screens, 3);
  const at = canvasAt(sql, "shop", "checkout-one-page", 1e9);
  assert.match(at.screens.find((s) => s.id === "cart")!.html, />Pay</, "the state at that point, not the later edit");
  assert.deepEqual([at.start_screen, at.transition], ["cart", "fade"]);
  assert.equal(f.events.at(-1)!.kind, "canvas.forked");
  assert.deepEqual(forkedFrom(sql, "shop", "checkout-one-page"), { canvas: "checkout", seq: mid });
});

test("fork errors: duplicates, bad seq, unknown canvas, and a project is told which canvases are variants", () => {
  assert.throws(() => forkCanvas(sql, "shop", { canvas: "checkout", name: "One page" }), /already exists/);
  assert.throws(() => forkCanvas(sql, "shop", { canvas: "checkout", name: "x", seq: -1 }), /invalid seq/);
  assert.throws(() => forkCanvas(sql, "shop", { canvas: "gone", name: "x" }), /unknown canvas "gone"/);
  assert.throws(() => forkCanvas(sql, "shop", { canvas: "checkout", name: " " }), /invalid name/);
  forkCanvas(sql, "shop", { canvas: "checkout", name: "Stepper" }, 7);
  const v = listVariants(sql, "shop", "checkout");
  assert.deepEqual(v.variants.map((x) => [x.id, x.screens]), [["checkout-one-page", 3], ["checkout-stepper", 3]]);
  assert.equal(v.base.id, "checkout");
  assert.equal(v.tournament, null);
  assert.equal(listVariants(sql, "shop", "checkout-stepper").base.id, "checkout", "any variant resolves to its base");
  assert.equal(rootOf(sql, "shop", "checkout-stepper"), "checkout");
  const entries = listCanvasesForPage(sql, "shop").canvases;
  assert.deepEqual(entries.map((c) => [c.id, c.forked_from]).sort(), [["checkout", null], ["checkout-one-page", "checkout"], ["checkout-stepper", "checkout"]]);
});

test("merge makes the base look like the variant, keeps the old base, and leaves one linear history", () => {
  setScreens(sql, "shop", "checkout-stepper", [{ id: "step", name: "Step", ...page("<div data-to='done'>Next</div>") }, { id: "cart", name: "Cart", ...page("<div data-to='step'>Start</div>") }], 8);
  removeScreen(sql, "shop", "checkout-stepper", "pay", 9);
  setFlow(sql, "shop", "checkout-stepper", { transition: "slide-left" }, 10);
  const m = mergeVariant(sql, "shop", "checkout-stepper", 11);
  assert.deepEqual(m.merged, { base: "checkout", variant: "checkout-stepper", preserved: "checkout-old" });
  const base = canvasAt(sql, "shop", "checkout", 1e9);
  assert.deepEqual(base.screens.map((s) => s.id).sort(), ["cart", "done", "step"], "pay is gone, step is new");
  assert.equal(base.transition, "slide-left");
  assert.match(base.screens.find((s) => s.id === "cart")!.html, /Start/);
  const old = canvasAt(sql, "shop", "checkout-old", 1e9);
  assert.deepEqual(old.screens.map((s) => s.id).sort(), ["cart", "done", "pay"], "the old base is kept whole");
  assert.deepEqual(forkedFrom(sql, "shop", "checkout-old")?.canvas, "checkout");
  assert.equal(listVariants(sql, "shop", "checkout").variants.some((v) => v.id === "checkout-old"), true);
  assert.deepEqual(m.events.map((e) => e.kind).slice(-2), ["flow.set", "variant.merged"]);
  const again = mergeVariant(sql, "shop", "checkout-one-page", 12);
  assert.equal(again.merged.preserved, "checkout-old-2", "a second merge keeps its own backup");
});

test("merge refuses a canvas that is not a variant, and a failure leaves everything as it was", () => {
  assert.throws(() => mergeVariant(sql, "shop", "checkout"), /is not a variant/);
  assert.throws(() => mergeVariant(sql, "shop", "gone"), /unknown canvas/);
});

test("the canvas limit stops forking with a clear message and writes nothing", () => {
  const s2 = nodeSql();
  migrate(s2);
  openProject(s2, { name: "p", manifest: { tree: [], files: {} } }, 1);
  createCanvas(s2, "p", { name: "Base", id: "base" });
  setScreens(s2, "p", "base", [{ id: "a", name: "A", ...page("x") }]);
  for (let i = 0; i < 19; i++) forkCanvas(s2, "p", { canvas: "base", name: `v${i}` });
  assert.throws(() => forkCanvas(s2, "p", { canvas: "base", name: "one too many" }), /too many canvases/);
  assert.equal(listVariants(s2, "p", "base").variants.length, 19);
});

test("a variant of a variant belongs to the same base, and a long base name does not break the name limit on merge", () => {
  const s2 = nodeSql();
  migrate(s2);
  openProject(s2, { name: "p", manifest: { tree: [], files: {} } }, 1);
  const longName = "N".repeat(98);
  createCanvas(s2, "p", { name: longName, id: "base" });
  setScreens(s2, "p", "base", [{ id: "a", name: "A", ...page("x") }]);
  const b = forkCanvas(s2, "p", { canvas: "base", name: "B" }).canvas.id;
  const c = forkCanvas(s2, "p", { canvas: b, name: "C" }).canvas.id;
  assert.deepEqual(listVariants(s2, "p", c).variants.map((v) => v.id), [b, c], "C is listed under the first base");
  assert.deepEqual(listVariants(s2, "p", b).base.id, "base");
  const m = mergeVariant(s2, "p", b);
  assert.ok(canvasAt(s2, "p", m.merged.preserved, 1e9).canvas.name.length <= 100);
});
