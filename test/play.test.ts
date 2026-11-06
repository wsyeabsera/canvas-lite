import { test } from "node:test";
import assert from "node:assert/strict";
import { describeCanvasDetail, refetchPlan } from "../web/canvas.ts";
import { hrefPlay, parseRoute, routeCanvas } from "../web/state.ts";
import {
  arrowDir, backTransition, barVisible, chipText, currentId, defaultFrame, fitStage, follow, gotoScreen, isToast, keyIntent, linkAction, moveFocus, nextFrame,
  planTransition, playFrameSpec, PLAY_SANDBOX, progress, reconcile, resolveTransition, reverseTransition, startScreen, startState, type PlayState, type Step,
} from "../web/play.ts";

const IDS = new Set(["home", "list", "detail", "pay"]);
const step = (r: ReturnType<typeof follow>): Step => {
  assert.ok(r && !isToast(r), "expected a step");
  return r;
};

test("the played frame is sandboxed with allow-same-origin and never allow-scripts", () => {
  assert.equal(PLAY_SANDBOX, "allow-same-origin");
  const spec = playFrameSpec({ name: "Home", width: 1920, height: 1080, html: "<b>x</b>" });
  assert.equal(spec.sandbox, "allow-same-origin");
  assert.ok(!spec.sandbox.includes("allow-scripts"));
  assert.equal(spec.referrerpolicy, "no-referrer");
  assert.equal(spec.srcdoc, "<b>x</b>");
});

test("route: play with and without a screen, validated", () => {
  assert.deepEqual(parseRoute("#/project/tv/canvas/main/play"), { view: "play", id: "tv", canvas: "main", screen: null });
  assert.deepEqual(parseRoute("#/project/tv/canvas/main/play/home-1"), { view: "play", id: "tv", canvas: "main", screen: "home-1" });
  for (const bad of ["#/project/tv/canvas/main/play/", "#/project/tv/canvas/Main/play", "#/project/tv/canvas/main/play/A B", "#/project/tv/canvas/main/play/a/b"]) assert.deepEqual(parseRoute(bad), { view: "activity" }, bad);
  assert.equal(hrefPlay("tv", "main"), "#/project/tv/canvas/main/play");
  assert.equal(hrefPlay("tv", "main", "home"), "#/project/tv/canvas/main/play/home");
  assert.equal(routeCanvas(parseRoute("#/project/tv/canvas/main/play")), "main");
  assert.equal(routeCanvas(parseRoute("#/project/tv")), null);
  // a flow.set or screen.set of the open canvas refetches it while playing
  assert.deepEqual(refetchPlan(parseRoute("#/project/tv/canvas/main/play"), { kind: "screen.set", project: "tv", payload: { canvas: "main", id: "a" } }), { list: true, detail: true });
});

test("describeCanvasDetail carries the flow with safe defaults", () => {
  const d = describeCanvasDetail({ canvas: { id: "m", start_screen: "list", transition: "push" }, screens: [] })!;
  assert.equal(d.canvas.start_screen, "list");
  assert.equal(d.canvas.transition, "push");
  const e = describeCanvasDetail({ canvas: { id: "m", start_screen: 5, transition: "spin" }, screens: [] })!;
  assert.equal(e.canvas.start_screen, null);
  assert.equal(e.canvas.transition, "none");
});

test("startScreen: the canvas start screen when it exists, else the first", () => {
  const s = [{ id: "a" }, { id: "b" }];
  assert.equal(startScreen(s, "b"), "b");
  assert.equal(startScreen(s, "gone"), "a");
  assert.equal(startScreen(s, null), "a");
  assert.equal(startScreen([], "b"), null);
});

test("linkAction: data-to wins over data-back, bad targets are no link", () => {
  assert.deepEqual(linkAction("list", "fade", null), { kind: "go", to: "list", transition: "fade" });
  assert.deepEqual(linkAction("list", null, ""), { kind: "go", to: "list", transition: null });
  assert.deepEqual(linkAction(null, null, ""), { kind: "back" });
  assert.deepEqual(linkAction("Bad Id", null, "x"), { kind: "back" });
  assert.equal(linkAction(null, null, "false"), null);
  assert.equal(linkAction(null, "fade", null), null);
  assert.equal(linkAction("javascript:1", null, null), null);
});

test("resolveTransition: own value, else canvas default, reduced motion forces none", () => {
  assert.equal(resolveTransition("slide-left", "fade", false), "slide-left");
  assert.equal(resolveTransition(" PUSH ", "none", false), "push");
  assert.equal(resolveTransition(null, "fade", false), "fade");
  assert.equal(resolveTransition("spin", "fade", false), "fade");
  assert.equal(resolveTransition("push", "fade", true), "none");
  assert.equal(resolveTransition(null, "fade", true), "none");
});

test("reverseTransition mirrors slides and flips a push, none and fade are their own reverse", () => {
  assert.equal(reverseTransition("slide-left"), "slide-right");
  assert.equal(reverseTransition("slide-right"), "slide-left");
  assert.equal(reverseTransition("push"), "push-back");
  assert.equal(reverseTransition("push-back"), "push");
  assert.equal(reverseTransition("fade"), "fade");
  assert.equal(reverseTransition("none"), "none");
});

test("planTransition: classes per kind, 220 ms, nothing under reduced motion or none", () => {
  assert.equal(planTransition("none", false), null);
  assert.equal(planTransition("push", true), null);
  assert.deepEqual(planTransition("fade", false), { fromClass: null, toClass: "pl-fade-in", ms: 220 });
  assert.deepEqual(planTransition("slide-left", false), { fromClass: "pl-slide-out-l", toClass: "pl-in-r", ms: 220 });
  assert.deepEqual(planTransition("slide-right", false), { fromClass: "pl-slide-out-r", toClass: "pl-in-l", ms: 220 });
  assert.deepEqual(planTransition("push", false), { fromClass: "pl-push-out-l", toClass: "pl-in-r", ms: 220 });
  assert.deepEqual(planTransition("push-back", false), { fromClass: "pl-push-out-r", toClass: "pl-in-l", ms: 220 });
  // a push moves the old screen too; a fade does not
  assert.ok(planTransition("push", false)!.fromClass);
});

test("navigation: go pushes, back pops with the reversed transition, back at the start is nothing", () => {
  let s: PlayState = startState("home");
  assert.equal(follow(s, { kind: "back" }, IDS, "none", false), null);
  const a = step(follow(s, { kind: "go", to: "list", transition: "slide-left" }, IDS, "fade", false));
  assert.deepEqual([a.from, a.to, a.transition], ["home", "list", "slide-left"]);
  s = a.state;
  const b = step(follow(s, { kind: "go", to: "detail", transition: null }, IDS, "fade", false));
  assert.equal(b.transition, "fade"); // the canvas default
  s = b.state;
  assert.equal(currentId(s), "detail");
  assert.equal(backTransition(s, false), "fade");
  const c = step(follow(s, { kind: "back" }, IDS, "fade", false));
  assert.deepEqual([c.from, c.to, c.transition], ["detail", "list", "fade"]);
  const d = step(follow(c.state, { kind: "back" }, IDS, "fade", false));
  assert.deepEqual([d.to, d.transition], ["home", "slide-right"]);
  assert.equal(currentId(d.state), "home");
  assert.equal(d.state.stack.length, 1);
});

test("navigation: push goes back as push-back; reduced motion is none both ways", () => {
  const a = step(follow(startState("home"), { kind: "go", to: "list", transition: "push" }, IDS, "none", false));
  assert.equal(step(follow(a.state, { kind: "back" }, IDS, "none", false)).transition, "push-back");
  assert.equal(step(follow(a.state, { kind: "back" }, IDS, "none", true)).transition, "none");
  assert.equal(step(follow(startState("home"), { kind: "go", to: "list", transition: "push" }, IDS, "none", true)).transition, "none");
});

test("navigation: an unknown target is a toast and changes nothing; the same screen is ignored", () => {
  const s = startState("home");
  const t = follow(s, { kind: "go", to: "checkout", transition: null }, IDS, "none", false);
  assert.deepEqual(t, { toast: 'No screen "checkout"' });
  assert.equal(follow(s, { kind: "go", to: "home", transition: "fade" }, IDS, "none", false), null);
});

test("gotoScreen is the remote goto hook: any screen, optional transition", () => {
  const s = startState("home");
  const r = gotoScreen(s, "pay", "push", IDS, "none", false) as Step;
  assert.deepEqual([r.from, r.to, r.transition], ["home", "pay", "push"]);
  assert.equal((gotoScreen(s, "pay", null, IDS, "fade", false) as Step).transition, "fade");
  assert.ok(isToast(gotoScreen(s, "nope", null, IDS, "fade", false)!));
});

test("reconcile drops removed screens from the history and restarts when none is left", () => {
  let s: PlayState = startState("home");
  s = step(follow(s, { kind: "go", to: "list", transition: null }, IDS, "none", false)).state;
  s = step(follow(s, { kind: "go", to: "detail", transition: null }, IDS, "none", false)).state;
  assert.equal(reconcile(s, IDS, "home"), s);
  const r = reconcile(s, new Set(["home", "detail"]), "home")!;
  assert.deepEqual(r.stack.map((e) => e.id), ["home", "detail"]);
  assert.deepEqual(reconcile(s, new Set(["pay"]), "pay")!.stack.map((e) => e.id), ["pay"]);
  assert.equal(reconcile(s, new Set(["pay"]), null), null);
});

test("fitStage fits the start screen into the window, centred with its aspect, via fitRect", () => {
  const v = fitStage({ w: 1920, h: 1080 }, { w: 1440, h: 900 }, 56);
  assert.ok(Math.abs(v.k - (1440 - 112) / 1920) < 1e-9); // width-bound
  assert.ok(Math.abs(v.x - 56) < 1e-9);
  assert.ok(Math.abs(v.y - (900 - 1080 * v.k) / 2) < 1e-9);
  const tall = fitStage({ w: 390, h: 844 }, { w: 1440, h: 900 }, 56); // height-bound, letterboxed left and right
  assert.ok(Math.abs(tall.k - (900 - 112) / 844) < 1e-9);
  assert.ok(Math.abs(tall.x - (1440 - 390 * tall.k) / 2) < 1e-9);
  assert.ok(fitStage({ w: 100, h: 100 }, { w: 3000, h: 2000 }).k <= 2); // small screens scale up, capped by viewport.ts
});

test("defaultFrame by size and the frame cycle", () => {
  assert.equal(defaultFrame(1920, 1080), "tv");
  assert.equal(defaultFrame(1280, 720), "tv");
  assert.equal(defaultFrame(390, 844), "phone");
  assert.equal(defaultFrame(1440, 900), "none");
  assert.equal(defaultFrame(800, 600), "none");
  assert.deepEqual([nextFrame("none"), nextFrame("tv"), nextFrame("phone")], ["tv", "phone", "none"]);
});

test("moveFocus: reading order first, then the nearest hotspot in the arrow's direction", () => {
  const r = (x: number, y: number, w = 100, h = 50) => ({ x, y, w, h });
  // 0 1 2 across, 3 below 0, 4 far below 2
  const rects = [r(0, 0), r(200, 0), r(400, 0), r(0, 200), r(400, 400)];
  assert.equal(moveFocus([], null, "right"), null);
  assert.equal(moveFocus(rects, null, "down"), 0);
  assert.equal(moveFocus([r(300, 100), r(10, 10), r(200, 10)], null, "left"), 1);
  assert.equal(moveFocus(rects, 0, "right"), 1);
  assert.equal(moveFocus(rects, 1, "right"), 2);
  assert.equal(moveFocus(rects, 2, "right"), 2); // nothing further: stays
  assert.equal(moveFocus(rects, 2, "left"), 1);
  assert.equal(moveFocus(rects, 0, "down"), 3);
  assert.equal(moveFocus(rects, 3, "up"), 0);
  assert.equal(moveFocus(rects, 2, "down"), 4);
  assert.equal(moveFocus(rects, 0, "up"), 0);
  // the straighter candidate beats a nearer one far off the axis
  const grid = [r(0, 0), r(150, 120), r(0, 300)];
  assert.equal(moveFocus(grid, 0, "down"), 2); // 120 + 2*150 = 420 loses to 300 straight below
  assert.equal(moveFocus([r(0, 0), r(400, 20), r(0, 160)], 0, "down"), 2);
  assert.equal(moveFocus(rects, 9, "left"), 0); // an out-of-range focus starts over
});

test("keyIntent: mouse mode vs remote mode", () => {
  assert.equal(arrowDir("ArrowUp"), "up");
  assert.equal(arrowDir("a"), null);
  assert.equal(keyIntent("Escape", "mouse", true), "exit");
  assert.equal(keyIntent("ArrowLeft", "mouse", true), "back");
  assert.equal(keyIntent("Backspace", "mouse", false), "back");
  assert.equal(keyIntent("ArrowRight", "mouse", true), null);
  assert.equal(keyIntent("r", "mouse", true), "restart");
  assert.equal(keyIntent("Enter", "mouse", true), "follow");
  assert.deepEqual(keyIntent("ArrowRight", "remote", true), { move: "right" });
  assert.equal(keyIntent("Backspace", "remote", true), "back");
  assert.equal(keyIntent("Escape", "remote", true), "back");
  assert.equal(keyIntent("Escape", "remote", false), "exit"); // Back at the start leaves play, like a TV
  assert.equal(keyIntent("m", "remote", true), "mode");
  assert.equal(keyIntent("f", "mouse", true), "frame");
  assert.equal(keyIntent("x", "remote", true), null);
});

test("barVisible: hover or recent activity, 2 s idle", () => {
  assert.equal(barVisible(1000, 0, false), true);
  assert.equal(barVisible(2000, 0, false), false);
  assert.equal(barVisible(5000, 0, true), true);
  assert.equal(barVisible(2500, 1000, false, 2000), true);
});

test("progress dots: current, visited, idle; a long flow shows only the label", () => {
  const screens = [{ id: "home" }, { id: "list" }, { id: "detail" }, { id: "pay" }];
  let s: PlayState = startState("home");
  s = step(follow(s, { kind: "go", to: "list", transition: null }, IDS, "none", false)).state;
  const p = progress(screens, s);
  assert.deepEqual(p.dots, [{ id: "home", state: "visited" }, { id: "list", state: "current" }, { id: "detail", state: "idle" }, { id: "pay", state: "idle" }]);
  assert.equal(p.label, "2 / 4");
  const many = Array.from({ length: 13 }, (_, i) => ({ id: `s${i}` }));
  assert.equal(progress(many, startState("s4")).dots, null);
  assert.equal(progress(many, startState("s4")).label, "5 / 13");
});

test("chipText: target, transition and Enter; dangling and back variants", () => {
  const screens = [{ id: "home", name: "Home" }, { id: "list", name: "Movie list" }];
  const s = startState("home");
  assert.equal(chipText({ kind: "go", to: "list", transition: "slide-left" }, screens, s, "fade", false), "Movie list · slide-left · Enter");
  assert.equal(chipText({ kind: "go", to: "list", transition: null }, screens, s, "fade", false), "Movie list · fade · Enter");
  assert.equal(chipText({ kind: "go", to: "list", transition: "push" }, screens, s, "fade", true), "Movie list · none · Enter");
  assert.equal(chipText({ kind: "go", to: "gone", transition: null }, screens, s, "fade", false), 'No screen "gone"');
  assert.equal(chipText({ kind: "back" }, screens, s, "fade", false), "Back · at the start");
  const a = step(follow(s, { kind: "go", to: "list", transition: "slide-left" }, new Set(["home", "list"]), "none", false));
  assert.equal(chipText({ kind: "back" }, screens, a.state, "none", false), "Back · slide-right · Enter");
});
