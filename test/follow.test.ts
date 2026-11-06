import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialFollow, isLive, onCanvasLoad, onPresenterEvent, parsePresenter, parseTour, pillModel, resumeFollow, takeOver, tourCaption, tourLabel, tourPause, tourPosition, tourResume, tourStart, tourTick,
  type TourStep,
} from "../web/follow.ts";
import { applyPresenterEvent, followTarget } from "../src/present.ts";
import { tourPosition as serverTourPosition } from "../src/flow.ts";
import { describeCanvasDetail } from "../web/canvas.ts";

const LOADED = 10_000;
const ev = (kind: string, payload: any, ts = LOADED + 100) => ({ kind, payload, ts });
const started = (screen = "home", ts?: number) => ev("presenter.started", { canvas: "main", screen, transition: "none" }, ts);
const go = (screen: string, transition = "fade", ts?: number) => ev("presenter.goto", { canvas: "main", screen, transition }, ts);
const SCREENS = [{ id: "home", name: "Home" }, { id: "list", name: "List" }, { id: "pay", name: "Pay" }];

test("live started and goto jump with their transition; backfilled history never does", () => {
  const a = onPresenterEvent(initialFollow(), started("home"), LOADED);
  assert.deepEqual(a.jump, { canvas: "main", screen: "home", transition: "none" });
  assert.deepEqual(onPresenterEvent(a.state, go("list"), LOADED).jump, { canvas: "main", screen: "list", transition: "fade" });
  const old = onPresenterEvent(initialFollow(), started("home", LOADED - 60_000), LOADED);
  assert.equal(old.jump, null);
  assert.equal(old.state.presenter?.screen, "home"); // still folded: the pill knows the session
  assert.equal(onPresenterEvent(old.state, go("list", "fade", LOADED - 1), LOADED).jump?.screen, "list"); // within the slack: live
  assert.equal(onPresenterEvent(old.state, go("list", "fade", LOADED - 5000), LOADED).jump, null);
  assert.ok(isLive(LOADED - 1500, LOADED) && !isLive(LOADED - 2500, LOADED));
});

test("stopped removes the session, never jumps, and other kinds change nothing", () => {
  const a = onPresenterEvent(initialFollow(), started(), LOADED).state;
  const b = onPresenterEvent(a, ev("presenter.stopped", { canvas: "main" }), LOADED);
  assert.equal(b.jump, null);
  assert.equal(b.state.presenter?.active, false);
  assert.equal(pillModel(b.state, "main", SCREENS, []), null);
  const same = onPresenterEvent(a, ev("screen.set", {}), LOADED);
  assert.equal(same.state, a);
  assert.equal(onPresenterEvent(initialFollow(), ev("presenter.stopped", { canvas: "main" }), LOADED).state.presenter, null);
});

test("take over stops following without ending the session; resume jumps to where Claude is", () => {
  let s = onPresenterEvent(initialFollow(), started(), LOADED).state;
  s = takeOver(s);
  assert.equal(s.following, false);
  assert.equal(s.presenter?.active, true);
  const moved = onPresenterEvent(s, go("pay"), LOADED);
  assert.equal(moved.jump, null);
  assert.equal(moved.state.presenter?.screen, "pay");
  assert.equal(takeOver(moved.state), moved.state);
  const r = resumeFollow(moved.state);
  assert.equal(r.state.following, true);
  assert.deepEqual(r.jump, { canvas: "main", screen: "pay", transition: "fade" });
  assert.equal(resumeFollow(initialFollow()).jump, null);
  // a new session turns following back on
  const again = onPresenterEvent(moved.state, started("home"), LOADED);
  assert.equal(again.state.following, true);
  assert.ok(again.jump);
});

test("page load offers the stored session once, only when it is active on this canvas", () => {
  const p = parsePresenter({ active: true, canvas: "main", screen: "list", transition: "push" })!;
  const a = onCanvasLoad(initialFollow(), p, "main");
  assert.deepEqual(a.jump, { canvas: "main", screen: "list", transition: "push" });
  assert.equal(onCanvasLoad(initialFollow(), p, "other").jump, null);
  assert.equal(onCanvasLoad(initialFollow(), { ...p, active: false }, "main").jump, null);
  assert.equal(onCanvasLoad(initialFollow(), null, "main").jump, null);
  const known = onPresenterEvent(initialFollow(), started("home", LOADED - 60_000), LOADED).state; // backfill folded it first
  assert.equal(onCanvasLoad(known, p, "main").jump?.screen, "list"); // the stored session still drives the jump
  assert.equal(onCanvasLoad(known, p, "main").state, known);
  assert.equal(onCanvasLoad(takeOver(initialFollow()), p, "main").jump, null); // following off
});

test("pill: live vs taken, steps from the tour or the visited screens, name fallback", () => {
  let s = onPresenterEvent(initialFollow(), started("home"), LOADED).state;
  s = onPresenterEvent(s, go("pay"), LOADED).state;
  const p = pillModel(s, "main", SCREENS, [])!;
  assert.equal(p.kind, "live");
  assert.equal(p.text, "Pay, step 2 of 3");
  assert.deepEqual(p.dots?.map((d) => d.state), ["visited", "idle", "current"]);
  assert.equal(pillModel(s, "elsewhere", SCREENS, []), null);
  assert.equal(pillModel(takeOver(s), "main", SCREENS, [])!.kind, "taken");
  const tour: TourStep[] = [{ screen: "home", dwell_ms: 1000 }, { screen: "list", dwell_ms: 1000 }, { screen: "pay", dwell_ms: 1000 }, { screen: "home", dwell_ms: 1000 }];
  const t = pillModel(s, "main", SCREENS, tour)!;
  assert.equal(t.text, "Pay, step 3 of 4");
  assert.equal(t.dots?.length, 4);
  assert.equal(pillModel(s, "main", [], [])!.name, "pay");
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, name: `S${i}` }));
  assert.equal(pillModel(onPresenterEvent(initialFollow(), started("s3"), LOADED).state, "main", many, [])!.dots, null);
});

test("web copies agree with the server's pure helpers", () => {
  for (const e of [started("a"), go("b"), ev("presenter.stopped", { canvas: "main" }), ev("presenter.goto", { canvas: "main", screen: "c", transition: "bogus" })]) {
    assert.deepEqual(onPresenterEvent(initialFollow(), e, LOADED).jump, followTarget(e, true), e.kind);
    if (e.kind !== "presenter.started") assert.deepEqual(onPresenterEvent(takeOver(initialFollow()), e, LOADED).jump, followTarget(e, false), `${e.kind} off`);
  }
  const folded = applyPresenterEvent(null, go("x"))!;
  assert.deepEqual(onPresenterEvent(initialFollow(), go("x"), LOADED).state.presenter, folded);
  const steps: TourStep[] = [{ screen: "a", dwell_ms: 500 }, { screen: "b", dwell_ms: 1500 }, { screen: "c", dwell_ms: 200 }];
  for (const t of [-5, 0, 499, 500, 1999, 2000, 2199, 2200, 9999]) assert.deepEqual(tourPosition(steps, t), serverTourPosition(steps, t), `t=${t}`);
  assert.equal(tourPosition([], 5), null);
});

const steps: TourStep[] = [{ screen: "home", dwell_ms: 1000, note: "Start here" }, { screen: "list", dwell_ms: 2000 }, { screen: "pay", dwell_ms: 500, note: "Done" }];

test("tour tick: enters each step once, stops at the end on the last step", () => {
  let r = tourStart(steps);
  const entered: number[] = [];
  const tick = (dt: number) => {
    const x = tourTick(r, dt);
    r = x.run;
    if (x.enter) entered.push(x.enter.index);
    return x;
  };
  assert.equal(tick(0).enter?.step.screen, "home");
  tick(400);
  tick(500);
  assert.deepEqual(entered, [0]);
  tick(150); // 1050: step 1
  tick(1900); // 2950: still step 1
  assert.deepEqual(entered, [0, 1]);
  tick(100); // 3050: step 2
  assert.deepEqual(entered, [0, 1, 2]);
  assert.equal(r.playing, true);
  tick(450); // 3500: end
  assert.equal(r.done, true);
  assert.equal(r.playing, false);
  assert.equal(tourTick(r, 5000).enter, null);
  assert.equal(tourCaption(r), null);
});

test("tour tick: a long gap skips to the right step; empty tour does nothing", () => {
  const x = tourTick(tourStart(steps), 1200);
  assert.equal(x.enter?.index, 1);
  const none = tourStart([]);
  assert.equal(none.playing, false);
  assert.equal(tourTick(none, 100).enter, null);
});

test("tour pause, resume, restart, caption and label", () => {
  let r = tourTick(tourStart(steps), 0).run;
  assert.equal(tourCaption(r), "Start here");
  assert.equal(tourLabel(r), "Pause · 1/3");
  r = tourTick(r, 1100).run;
  assert.equal(tourCaption(r), null); // step 1 has no note
  r = tourPause(r);
  assert.equal(tourTick(r, 5000).enter, null);
  assert.equal(tourTick(r, 5000).run.elapsed, r.elapsed);
  assert.equal(tourLabel(r), "Resume · 2/3");
  assert.equal(tourCaption(tourPause(tourTick(tourStart(steps), 0).run)), "Start here"); // paused keeps its caption
  r = tourResume(r);
  assert.equal(r.playing, true);
  assert.equal(r.elapsed, 1100);
  const finished = tourTick(r, 10_000).run;
  assert.equal(tourLabel(finished), "Tour");
  const again = tourResume(finished);
  assert.deepEqual(again, tourStart(steps));
  assert.equal(tourTick(again, 0).enter?.index, 0);
});

test("parsers keep valid data and drop garbage; canvas detail carries tour and presenter", () => {
  assert.deepEqual(parseTour({ steps: [{ screen: "a", dwell_ms: 300, note: "n" }, { screen: "b", dwell_ms: 0 }, { dwell_ms: 5 }, { screen: "c", dwell_ms: 400, note: "" }] }), [{ screen: "a", dwell_ms: 300, note: "n" }, { screen: "c", dwell_ms: 400 }]);
  assert.deepEqual(parseTour(null), []);
  assert.equal(parsePresenter({ canvas: 1 }), null);
  assert.equal(parsePresenter({ active: true, canvas: "m", screen: "s", transition: "zoom" })?.transition, "none");
  const d = describeCanvasDetail({ canvas: { id: "m" }, screens: [], tour: { steps: [{ screen: "a", dwell_ms: 300 }] }, presenter: { active: true, canvas: "m", screen: "a", transition: "fade" } })!;
  assert.equal(d.tour.length, 1);
  assert.equal(d.presenter?.screen, "a");
  const bare = describeCanvasDetail({ canvas: { id: "m" }, screens: [] })!;
  assert.deepEqual(bare.tour, []);
  assert.equal(bare.presenter, null);
});
