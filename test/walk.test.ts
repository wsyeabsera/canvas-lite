import { test } from "node:test";
import assert from "node:assert/strict";
import { autoStart, autoTick, bubblePlace, clampStep, deriveSteps, spotTarget, stepBy, stepForScreen, walkHeader, walkSteps, WALK_DWELL_MS } from "../web/walk.ts";
import { hrefWalk, parseRoute, routeCanvas } from "../web/state.ts";

const S = (id: string, to: string | null, extra = "") => ({ id, name: id.toUpperCase(), html: `<div>${to ? `<a data-to="${to}">go</a>` : ""}${extra}</div>` });
const SCREENS = [S("a", "b"), S("b", "c"), S("c", "a"), S("z", null)];

test("derived steps follow the first link from the start until a repeat", () => {
  const steps = deriveSteps(SCREENS, "a");
  assert.deepEqual(steps.map((s) => s.screen), ["a", "b", "c"]);
  assert.deepEqual(steps[0], { screen: "a", name: "A", dwell_ms: WALK_DWELL_MS, note: null });
  assert.deepEqual(deriveSteps(SCREENS, "b").map((s) => s.screen), ["b", "c", "a"]);
  assert.deepEqual(deriveSteps(SCREENS, null).map((s) => s.screen), ["a", "b", "c"]); // first screen when no start
  assert.deepEqual(deriveSteps(SCREENS, "z").map((s) => s.screen), ["z"]); // dead end
  assert.deepEqual(deriveSteps([], null), []);
});

test("derived steps skip back links and stop at a missing screen", () => {
  const screens = [{ id: "a", name: "A", html: `<b data-to="a" data-back></b><i data-to="gone"></i>` }, S("x", "x")];
  assert.deepEqual(deriveSteps(screens, "a").map((s) => s.screen), ["a"]);
  assert.deepEqual(deriveSteps([S("p", "p")], "p").map((s) => s.screen), ["p"]); // self link
});

test("tour steps win, unknown screens drop, and the header reads from the tour total", () => {
  const tour = [{ screen: "a", dwell_ms: 4000, note: "Tap" }, { screen: "nope", dwell_ms: 1000 }, { screen: "c", dwell_ms: 8600 }];
  const w = walkSteps(SCREENS, "a", tour);
  assert.equal(w.fromTour, true);
  assert.deepEqual(w.steps.map((s) => [s.screen, s.note, s.dwell_ms]), [["a", "Tap", 4000], ["c", null, 8600]]);
  assert.equal(walkHeader(w.steps, true), "2 steps · about 13 s");
  const d = walkSteps(SCREENS, "a", [{ screen: "nope", dwell_ms: 1000 }]);
  assert.equal(d.fromTour, false);
  assert.equal(walkHeader(d.steps, false), "3 screens");
  assert.equal(walkHeader(deriveSteps([S("p", null)], null), false), "1 screen");
});

test("stepping clamps at the ends; a shown screen maps back to a step", () => {
  const steps = deriveSteps(SCREENS, "a");
  assert.equal(stepBy(steps, 0, -1), null);
  assert.equal(stepBy(steps, 0, 1), 1);
  assert.equal(stepBy(steps, 2, 1), null);
  const loop = [{ screen: "a" }, { screen: "b" }, { screen: "a" }];
  assert.equal(stepForScreen(loop, "a", 0), 0);
  assert.equal(stepForScreen(loop, "a", 1), 2); // nearest later
  assert.equal(stepForScreen(loop, "b", 2), 1); // else the first
  assert.equal(stepForScreen(loop, "q", 0), null); // not a step: the rail stays
  assert.equal(clampStep(5, 3), 2);
  assert.equal(clampStep(0, 0), 0);
});

test("auto-advance enters each step after its dwell and stops after the last", () => {
  const steps = deriveSteps(SCREENS, "a"); // 3 x 2500
  let a = autoStart(steps, 0)!;
  assert.equal(a.base, 0);
  assert.equal(autoTick(a, 0).enter, null); // step 0 is already on show
  let r = autoTick(a, 2500);
  assert.equal(r.enter, 1);
  r = autoTick(r.auto!, 2500);
  assert.equal(r.enter, 2);
  r = autoTick(r.auto!, 100);
  assert.equal(r.enter, null);
  r = autoTick(r.auto!, 2400);
  assert.equal(r.auto, null); // done: the switch goes off, last step stays
  a = autoStart(steps, 1)!; // from the middle: indices stay absolute
  assert.equal(autoTick(a, 2500).enter, 2);
});

test("auto-advance on the last step starts again from the top", () => {
  const steps = deriveSteps(SCREENS, "a");
  const a = autoStart(steps, 2)!;
  assert.equal(a.base, 0);
  assert.equal(autoTick(a, 0).enter, 0);
  assert.equal(autoStart([], 0), null);
});

test("spotlight target is the first link in reading order; the bubble goes below or above and stays inside", () => {
  assert.equal(spotTarget([]), null);
  assert.deepEqual(spotTarget([{ x: 300, y: 100, w: 10, h: 10 }, { x: 20, y: 100.5, w: 10, h: 10 }, { x: 0, y: 400, w: 10, h: 10 }]), { x: 20, y: 100.5, w: 10, h: 10 });
  const bounds = { w: 1000, h: 600 };
  const bubble = { w: 280, h: 100 };
  assert.deepEqual(bubblePlace({ x: 100, y: 100, w: 100, h: 40 }, bubble, bounds), { left: 10, top: 154, side: "below" });
  assert.equal(bubblePlace({ x: 100, y: 520, w: 100, h: 40 }, bubble, bounds).side, "above");
  assert.equal(bubblePlace({ x: 950, y: 100, w: 50, h: 40 }, bubble, bounds).left, 720);
});

test("walk route: #/project/<id>/canvas/<cid>/walk", () => {
  assert.deepEqual(parseRoute("#/project/p/canvas/c/walk"), { view: "walk", id: "p", canvas: "c" });
  assert.equal(hrefWalk("p", "c"), "#/project/p/canvas/c/walk");
  assert.equal(routeCanvas({ view: "walk", id: "p", canvas: "c" }), "c");
  assert.deepEqual(parseRoute("#/project/p/canvas/C!/walk"), { view: "activity" });
});
