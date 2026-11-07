import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aboutLabel, buildTimeline, captionFor, centerOf, chapterFractions, clampPt, clockLabel, CLICK_MS, cursorStart, durationLabel, easeInOut, endCardActive, endCardCancel,
  endCardLine, endCardStart, endCardTick, END_COUNTDOWN_MS, endOutcome, findScenario, fractionOf, GLIDE_MS, goesBack, initialClock, lerpPt, msAtFraction, nextIndex, nextStepMs,
  parseScenarios, parseSpeed, pickerLine, pickLink, playableSteps, positionAt, prevStepMs, scenarioChip, scenariosLabel, scrubLabel, seekFraction, stepAtFraction, stepsLabel,
  stepStart, tick, travelState, tryItScreen, TRAVEL_MS, watchKey, type LinkCandidate,
} from "../web/watch.ts";
import { describeCanvasDetail, canvasEvent, CANVAS_KINDS, refetchPlan } from "../web/canvas.ts";
import { hrefWatch, parseRoute, routeCanvas } from "../web/state.ts";

const steps = (...d: number[]) => d.map((dwell_ms, i) => ({ screen: `s${i}`, dwell_ms }));

test("parseScenarios keeps good entries, drops the rest and defaults to []", () => {
  assert.deepEqual(parseScenarios(undefined), []);
  assert.deepEqual(parseScenarios("x"), []);
  const out = parseScenarios([
    { id: "a", name: "Login", description: "  Sign in ", steps: [{ screen: "home", dwell_ms: 3000, caption: "Hello", via: "Sign" }, { screen: "", dwell_ms: 1 }, { screen: "x" }], duration_ms: 8000, missing: [1, -2, 1.5, "z"] },
    { id: "", steps: [{ screen: "a" }] },
    { id: "empty", steps: [] },
    { name: "no id", steps: [{ screen: "a" }] },
    null,
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    id: "a", name: "Login", description: "  Sign in ", duration_ms: 8000, missing: [1],
    steps: [{ screen: "home", dwell_ms: 3000, caption: "Hello", via: "Sign" }, { screen: "x", dwell_ms: 2500 }],
  });
});

test("parseScenarios clamps dwell and fills name and duration", () => {
  const [s] = parseScenarios([{ id: "q", steps: [{ screen: "a", dwell_ms: 5 }, { screen: "b", dwell_ms: 9e9 }] }]);
  assert.equal(s!.name, "q");
  assert.deepEqual(s!.steps.map((x) => x.dwell_ms), [200, 60000]);
  assert.equal(s!.duration_ms, 60200);
  assert.deepEqual(s!.missing, []);
  assert.equal("description" in s!, false);
});

test("describeCanvasDetail carries scenarios, [] when absent", () => {
  const base = { canvas: { id: "c", name: "C" }, screens: [] };
  assert.deepEqual(describeCanvasDetail(base)!.scenarios, []);
  const d = describeCanvasDetail({ ...base, scenarios: [{ id: "a", name: "A", steps: [{ screen: "x", dwell_ms: 1000 }], duration_ms: 1000, missing: [] }] })!;
  assert.equal(d.scenarios[0]!.id, "a");
});

test("scenarios.set is a canvas event that refetches the open canvas", () => {
  assert.ok(CANVAS_KINDS.includes("scenarios.set"));
  assert.equal(canvasEvent({ kind: "scenarios.set", payload: { canvas: "c" } })?.canvas, "c");
  const plan = refetchPlan({ view: "watch", id: "p", canvas: "c", scenario: null }, { kind: "scenarios.set", project: "p", payload: { canvas: "c" } });
  assert.deepEqual(plan, { list: true, detail: true });
});

test("route: watch with and without a scenario, hrefWatch, routeCanvas", () => {
  assert.deepEqual(parseRoute("#/project/tv/canvas/main/watch"), { view: "watch", id: "tv", canvas: "main", scenario: null });
  assert.deepEqual(parseRoute("#/project/tv/canvas/main/watch/login"), { view: "watch", id: "tv", canvas: "main", scenario: "login" });
  assert.deepEqual(parseRoute("#/project/tv/canvas/main/watch/Bad"), { view: "activity" });
  assert.deepEqual(parseRoute("#/project/tv/canvas/Main/watch"), { view: "activity" });
  assert.equal(hrefWatch("tv", "main"), "#/project/tv/canvas/main/watch");
  assert.equal(hrefWatch("tv", "main", "login"), "#/project/tv/canvas/main/watch/login");
  assert.equal(parseRoute(hrefWatch("tv", "main", "login")).view, "watch");
  assert.equal(routeCanvas(parseRoute("#/project/tv/canvas/main/watch")), "main");
});

test("playableSteps drops missing indexes and unknown screens", () => {
  const sc = { steps: [{ screen: "a", dwell_ms: 1 }, { screen: "b", dwell_ms: 1 }, { screen: "c", dwell_ms: 1 }, { screen: "d", dwell_ms: 1 }], missing: [2] };
  assert.deepEqual(playableSteps(sc, new Set(["a", "b", "c"])).map((s) => s.screen), ["a", "b"]);
  assert.deepEqual(playableSteps({ steps: [], missing: [] }, new Set()), []);
});

test("findScenario", () => {
  const l = parseScenarios([{ id: "a", steps: [{ screen: "x" }] }]);
  assert.equal(findScenario(l, "a")?.id, "a");
  assert.equal(findScenario(l, "b"), null);
  assert.equal(findScenario(l, null), null);
});

test("buildTimeline: step 0 only dwells, later steps travel first", () => {
  const tl = buildTimeline(steps(2000, 3000, 1000));
  assert.equal(TRAVEL_MS, GLIDE_MS + CLICK_MS);
  assert.deepEqual(tl.segments, [
    { index: 0, start: 0, travelMs: 0, dwellMs: 2000, end: 2000 },
    { index: 1, start: 2000, travelMs: TRAVEL_MS, dwellMs: 3000, end: 2000 + TRAVEL_MS + 3000 },
    { index: 2, start: 5000 + TRAVEL_MS, travelMs: TRAVEL_MS, dwellMs: 1000, end: 6000 + 2 * TRAVEL_MS },
  ]);
  assert.equal(tl.total, 6000 + 2 * TRAVEL_MS);
  assert.deepEqual(buildTimeline([]), { segments: [], total: 0 });
});

test("positionAt: phases, progress, clamping and done", () => {
  const tl = buildTimeline(steps(2000, 3000));
  assert.deepEqual(positionAt(tl, 0), { step: 0, phase: "dwell", progress: 0, ms: 0, done: false });
  assert.deepEqual(positionAt(tl, 1000), { step: 0, phase: "dwell", progress: 0.5, ms: 1000, done: false });
  const t1 = positionAt(tl, 2000 + TRAVEL_MS / 2)!;
  assert.deepEqual([t1.step, t1.phase, t1.progress], [1, "travel", 0.5]);
  const d1 = positionAt(tl, 2000 + TRAVEL_MS)!;
  assert.deepEqual([d1.step, d1.phase, d1.progress], [1, "dwell", 0]);
  assert.equal(positionAt(tl, 2000 + TRAVEL_MS + 1500)!.progress, 0.5);
  const end = positionAt(tl, 1e9)!;
  assert.deepEqual([end.step, end.phase, end.progress, end.done, end.ms], [1, "dwell", 1, true, tl.total]);
  assert.equal(positionAt(tl, tl.total - 1)!.done, false);
  assert.equal(positionAt(tl, -50)!.ms, 0);
  assert.equal(positionAt(tl, NaN)!.ms, 0);
  assert.equal(positionAt(buildTimeline([]), 5), null);
});

test("stepStart, next and previous step", () => {
  const tl = buildTimeline(steps(1000, 1000, 1000));
  const s1 = stepStart(tl, 1), s2 = stepStart(tl, 2);
  assert.equal(stepStart(tl, 0), 0);
  assert.equal(s1, 1000);
  assert.equal(s2, 2000 + TRAVEL_MS);
  assert.equal(stepStart(tl, 99), s2);
  assert.equal(stepStart(tl, -3), 0);
  assert.equal(nextStepMs(tl, 10), s1);
  assert.equal(nextStepMs(tl, s1 + 5), s2);
  assert.equal(nextStepMs(tl, s2 + 5), tl.total); // last step: the end
  assert.equal(prevStepMs(tl, s2 + 5), s1);
  assert.equal(prevStepMs(tl, s1 + 5), 0);
  assert.equal(prevStepMs(tl, 500), 0);
  assert.equal(prevStepMs(tl, tl.total), s1); // done sits on the last step
  assert.equal(nextStepMs(buildTimeline([]), 0), 0);
  assert.equal(prevStepMs(buildTimeline([]), 0), 0);
});

test("chapter fractions are proportional and cover the bar", () => {
  const tl = buildTimeline(steps(1000, 1000));
  const f = chapterFractions(tl);
  assert.equal(f.length, 2);
  assert.equal(f[0]!.start, 0);
  assert.ok(Math.abs(f[0]!.width - 1000 / tl.total) < 1e-12);
  assert.ok(Math.abs(f[1]!.start + f[1]!.width - 1) < 1e-12);
  assert.ok(f[1]!.width > f[0]!.width); // step 1 includes its travel
  assert.deepEqual(chapterFractions(buildTimeline([])), []);
});

test("fractions: ms <-> fraction, step under the pointer, seek to a boundary", () => {
  const tl = buildTimeline(steps(1000, 1000, 1000));
  assert.equal(fractionOf(tl, 0), 0);
  assert.equal(fractionOf(tl, tl.total), 1);
  assert.equal(fractionOf(tl, 1e9), 1);
  assert.equal(fractionOf(buildTimeline([]), 5), 0);
  assert.equal(msAtFraction(tl, 0.5), tl.total / 2);
  assert.equal(msAtFraction(tl, 7), tl.total);
  assert.equal(stepAtFraction(tl, 0), 0);
  assert.equal(stepAtFraction(tl, 1), 2); // the very end still names the last step
  assert.equal(stepAtFraction(tl, 0.5), 1);
  assert.equal(seekFraction(tl, 0.01), 0);
  assert.equal(seekFraction(tl, 0.5), stepStart(tl, 1));
  assert.equal(seekFraction(tl, 0.99), stepStart(tl, 2));
  assert.equal(stepAtFraction(buildTimeline([]), 0.5), 0);
});

test("clock: speed scales, pause freezes, the end stops once", () => {
  const c = initialClock();
  assert.deepEqual(c, { ms: 0, playing: true, speed: 1 });
  assert.equal(tick(c, 100, 1000).clock.ms, 100);
  assert.equal(tick({ ...c, speed: 2 }, 100, 1000).clock.ms, 200);
  assert.equal(tick({ ...c, speed: 0.5 }, 100, 1000).clock.ms, 50);
  assert.equal(tick({ ...c, playing: false }, 100, 1000).clock.ms, 0);
  assert.equal(tick(c, 0, 1000).clock, c);
  assert.equal(tick(c, -5, 1000).clock, c);
  const end = tick({ ...c, ms: 950 }, 100, 1000);
  assert.deepEqual([end.clock.ms, end.clock.playing, end.ended], [1000, false, true]);
  assert.equal(tick(end.clock, 100, 1000).ended, false);
  assert.equal(parseSpeed(2), 2);
  assert.equal(parseSpeed(3), 1);
  assert.equal(parseSpeed("2"), 1);
});

test("time labels", () => {
  assert.equal(clockLabel(0), "0:00");
  assert.equal(clockLabel(59_999), "0:59");
  assert.equal(clockLabel(60_000), "1:00");
  assert.equal(clockLabel(125_000), "2:05");
  assert.equal(clockLabel(-1), "0:00");
  assert.equal(clockLabel(NaN), "0:00");
  assert.equal(durationLabel(59_600), "1:00");
  assert.equal(durationLabel(100_000), "1:40");
  assert.equal(aboutLabel(100_000), "about 1 min 40 s");
  assert.equal(aboutLabel(120_000), "about 2 min");
  assert.equal(aboutLabel(40_000), "about 40 s");
  assert.equal(aboutLabel(0), "about 5 s");
  assert.equal(aboutLabel(101_900), "about 1 min 40 s");
  assert.equal(stepsLabel(1), "1 step");
  assert.equal(stepsLabel(5), "5 steps");
  assert.equal(scenariosLabel(1), "1 scenario");
  assert.equal(scenariosLabel(3), "3 scenarios");
  assert.equal(scenarioChip(0, 3), "Scenario 1 of 3");
});

test("pickerLine sums every scenario with its travel", () => {
  const a = steps(10_000, 10_000); // 20 s + one travel
  const line = pickerLine("Shop", [{ steps: a }, { steps: steps(30_000) }]);
  assert.equal(line, `Shop · 2 scenarios · ${aboutLabel(20_000 + TRAVEL_MS + 30_000)}`);
  assert.equal(pickerLine("Shop", [{ steps: steps(60_000) }]), "Shop · 1 scenario · about 1 min");
});

test("scrub label and caption", () => {
  assert.equal(scrubLabel(1, { caption: "Tap Buy" }, "Cart"), "2 · Tap Buy");
  assert.equal(scrubLabel(0, {}, "Home"), "1 · Home");
  assert.equal(captionFor({ caption: "Hi" }, true), "Hi");
  assert.equal(captionFor({ caption: "Hi" }, false), null);
  assert.equal(captionFor({}, true), null);
  assert.equal(captionFor(undefined, true), null);
});

const C = (dataTo: string | null, text = "", dataBack = false): LinkCandidate => ({ dataTo, dataBack, text });

test("pickLink: the first data-to equal to the target", () => {
  assert.equal(pickLink([C("a"), C("b"), C("b")], "b", undefined, false), 1);
  assert.equal(pickLink([C("a"), C(null)], "b", undefined, false), null);
  assert.equal(pickLink([], "b", undefined, false), null);
  assert.equal(pickLink([C(" b ")], "b", undefined, false), 0);
});

test("pickLink: via narrows case-insensitively, falls back to the first", () => {
  const cs = [C("b", "Cancel order"), C("b", "Buy NOW"), C("b", "Buy later")];
  assert.equal(pickLink(cs, "b", "buy", false), 1);
  assert.equal(pickLink(cs, "b", "LATER", false), 2);
  assert.equal(pickLink(cs, "b", "zzz", false), 0);
  assert.equal(pickLink(cs, "b", "  ", false), 0);
  assert.equal(pickLink(cs, "b", undefined, false), 0);
});

test("pickLink: a data-back element serves a step back, a data-to match still wins", () => {
  const cs = [C("c", "Next"), C(null, "Back", true), C("a", "Home")];
  assert.equal(pickLink(cs, "a", undefined, true), 2);
  assert.equal(pickLink(cs, "z", undefined, true), 1); // no data-to for z: the back control
  assert.equal(pickLink(cs, "z", undefined, false), null); // not going back: data-back is no answer
  assert.equal(pickLink([C(null, "Go A", true), C(null, "Go B", true)], "z", "b", true), 1);
});

test("goesBack: the target screen was shown by an earlier step", () => {
  const s = [{ screen: "a" }, { screen: "b" }, { screen: "a" }, { screen: "c" }];
  assert.equal(goesBack(s, 0), false);
  assert.equal(goesBack(s, 1), false);
  assert.equal(goesBack(s, 2), true);
  assert.equal(goesBack(s, 3), false);
  assert.equal(goesBack([{ screen: "a" }, { screen: "a" }], 1), true);
});

test("travelState: glide eased, then the click ripple; reduced motion jumps", () => {
  const g = GLIDE_MS / TRAVEL_MS;
  assert.deepEqual(travelState(0, false), { glide: 0, ripple: null });
  const mid = travelState(g / 2, false);
  assert.ok(Math.abs(mid.glide - 0.5) < 1e-9);
  assert.equal(mid.ripple, null);
  assert.deepEqual(travelState(g, false), { glide: 1, ripple: 0 });
  const r = travelState(g + (1 - g) / 2, false);
  assert.equal(r.glide, 1);
  assert.ok(Math.abs(r.ripple! - 0.5) < 1e-9);
  assert.equal(travelState(1, false).ripple, 1);
  assert.equal(travelState(0, true).glide, 1);
  assert.equal(travelState(0, true).ripple, null);
  assert.equal(travelState(-3, false).glide, 0);
  assert.equal(travelState(9, false).ripple, 1);
  assert.equal(CLICK_MS, 250);
});

test("easing and geometry helpers", () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.equal(easeInOut(0.5), 0.5);
  assert.ok(easeInOut(0.25) < 0.25 && easeInOut(0.75) > 0.75);
  assert.deepEqual(lerpPt({ x: 0, y: 10 }, { x: 10, y: 30 }, 0.5), { x: 5, y: 20 });
  assert.deepEqual(centerOf({ x: 10, y: 20, w: 100, h: 40 }), { x: 60, y: 40 });
  assert.deepEqual(clampPt({ x: -5, y: 900 }, { w: 800, h: 600 }), { x: 0, y: 600 });
  const stage = { w: 1000, h: 500 };
  assert.deepEqual(cursorStart(stage, { x: 100, y: 100 }), { x: 780, y: 430 });
  assert.deepEqual(cursorStart(stage, { x: 780, y: 430 }), { x: 500, y: 150 }); // never starts on the target
});

test("play all: next at once, end card at the end or in single mode", () => {
  assert.equal(nextIndex(3, 0), 1);
  assert.equal(nextIndex(3, 2), null);
  assert.deepEqual(endOutcome(true, 3, 0), { kind: "next", scenario: 1 });
  assert.deepEqual(endOutcome(true, 3, 2), { kind: "card", next: null });
  assert.deepEqual(endOutcome(false, 3, 0), { kind: "card", next: 1 });
  assert.deepEqual(endOutcome(false, 3, 2), { kind: "card", next: null });
  assert.deepEqual(endOutcome(false, 1, 0), { kind: "card", next: null });
});

test("end card countdown: ticks, fires once, cancel stops it", () => {
  let c = endCardStart(1);
  assert.equal(c.remainingMs, END_COUNTDOWN_MS);
  assert.equal(endCardActive(c), true);
  assert.equal(endCardLine("Checkout", c), "Up next: Checkout, starting in 5 s");
  let r = endCardTick(c, 1000);
  assert.equal(r.fire, false);
  assert.equal(endCardLine("Checkout", r.card), "Up next: Checkout, starting in 4 s");
  r = endCardTick(r.card, 3500);
  assert.equal(endCardLine("Checkout", r.card), "Up next: Checkout, starting in 1 s");
  r = endCardTick(r.card, 600);
  assert.equal(r.fire, true);
  assert.equal(endCardActive(r.card), false);
  assert.equal(endCardTick(r.card, 1000).fire, false); // spent
  c = endCardCancel(endCardStart(1));
  assert.equal(endCardTick(c, 99_000).fire, false);
  assert.equal(endCardLine("Checkout", c), "Up next: Checkout");
  assert.equal(endCardCancel(c), c);
  assert.equal(endCardTick(endCardStart(1), 0).fire, false);
});

test("end card with nothing next never counts down", () => {
  const c = endCardStart(null);
  assert.equal(endCardActive(c), false);
  assert.equal(endCardTick(c, 10_000).fire, false);
  assert.equal(endCardLine(null, c), null);
});

test("tryItScreen is the last step's screen", () => {
  assert.equal(tryItScreen([{ screen: "a" }, { screen: "z" }]), "z");
  assert.equal(tryItScreen([]), null);
});

test("watch keys", () => {
  assert.equal(watchKey(" "), "toggle");
  assert.equal(watchKey("ArrowLeft"), "prev");
  assert.equal(watchKey("ArrowRight"), "next");
  assert.equal(watchKey("Escape"), "exit");
  assert.equal(watchKey("c"), "captions");
  assert.equal(watchKey("F"), "fullscreen");
  assert.equal(watchKey("x"), null);
  assert.equal(watchKey("Enter"), null);
});
