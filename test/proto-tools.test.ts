import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas, hasBackLink, readCanvas, removeScreen, setFlow, setScreens } from "../src/canvases.ts";
import {
  applyEdits, checkTour, FLOW_TEXT, patchScreen, readCanvasForPage, readFlow, readTour, setTour, tourPosition, validateFlow, validateScreens,
  PATCH_EDITS_MAX, TOUR_STEPS_MAX,
} from "../src/flow.ts";
import { applyPresenterEvent, followTarget, goto, present, presenterState, stopPresent } from "../src/present.ts";
import { openProject } from "../src/projects.ts";
import { eventsAfter, migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const mk = (id: string, html: string) => ({ id, name: id, width: 400, height: 300, html });
const setup = (screens = [mk("home", `<a data-to="detail">go</a>`), mk("detail", `<a data-back>b</a><a data-to="home">h</a>`)]) => {
  const sql = nodeSql();
  migrate(sql);
  openProject(sql, { name: "tvdash", manifest: { tree: [], files: {} } }, 1);
  createCanvas(sql, "tvdash", { name: "Main" }, 2);
  if (screens.length) setScreens(sql, "tvdash", "main", screens, 3);
  return sql;
};

test("hasBackLink: any element, case-insensitive, ignores comments and text", () => {
  assert.equal(hasBackLink(`<a DATA-BACK>x</a>`), true);
  assert.equal(hasBackLink(`<a data-back="">`), true);
  assert.equal(hasBackLink(`<!-- <a data-back> --><p>data-back</p>`), false);
});

test("validateScreens: dangling link is an error, once per target", () => {
  const i = validateScreens([mk("a", `<b data-to="x"></b><i data-to="x"></i>`)], "a");
  assert.deepEqual(i.filter((v) => v.kind === "dangling_link").map((v) => [v.severity, v.screen, v.to]), [["error", "a", "x"]]);
});

test("validateScreens: no screens is an error", () => {
  assert.deepEqual(validateScreens([], null).map((v) => v.kind), ["no_screens"]);
});

test("validateScreens: no start screen warns and names the first screen", () => {
  const i = validateScreens([mk("a", `<a data-to="b">`), mk("b", `<a data-back>`)], null);
  assert.deepEqual(i.map((v) => [v.severity, v.kind, v.screen]), [["warning", "no_start_screen", "a"]]);
});

test("validateScreens: unreachable screens (also from a cycle that does not touch the start)", () => {
  const i = validateScreens([mk("a", `<a data-to="b">`), mk("b", `<a data-back>`), mk("c", `<a data-to="d">`), mk("d", `<a data-to="c">`)], "a");
  assert.deepEqual(i.map((v) => [v.kind, v.screen]), [["unreachable", "c"], ["unreachable", "d"]]);
});

test("validateScreens: start screen choice changes reachability; a dangling link does not make anything reachable", () => {
  const screens = [mk("a", `<a data-to="b">`), mk("b", `<a data-back>`)];
  assert.deepEqual(validateScreens(screens, "b").map((v) => [v.kind, v.screen]), [["unreachable", "a"]]);
  assert.deepEqual(validateScreens([mk("a", `<a data-to="ghost">`), mk("b", `<a data-back>`)], "a").map((v) => v.kind), ["dangling_link", "unreachable"]);
});

test("validateScreens: dead ends are info; a back control or any link is not a dead end", () => {
  const i = validateScreens([mk("a", `<a data-to="b"><a data-to="c">`), mk("b", `<p>end</p>`), mk("c", `<a data-back>`)], "a");
  assert.deepEqual(i.map((v) => [v.severity, v.kind, v.screen]), [["info", "dead_end", "b"]]);
});

test("validateScreens: bad data-transition warns; severities are ordered errors, warnings, info", () => {
  const i = validateScreens([mk("a", `<a data-to="b" data-transition="zoom"><a data-to="nope">`), mk("b", `x`), mk("z", `y`)], null);
  assert.deepEqual(i.map((v) => v.severity), ["error", "warning", "warning", "warning", "info", "info"]);
  assert.ok(i.some((v) => v.kind === "bad_transition" && v.to === "b"));
});

test("validateFlow on the db: ok flag, effective start, a removed start screen falls back to the first", () => {
  const sql = setup();
  let v = validateFlow(sql, "tvdash", "main");
  assert.equal(v.ok, true);
  assert.equal(v.effective_start, "home");
  assert.deepEqual(v.issues.map((x) => x.kind), ["no_start_screen"]);
  setFlow(sql, "tvdash", "main", { start_screen: "detail" });
  v = validateFlow(sql, "tvdash", "main");
  assert.deepEqual(v.issues, []);
  removeScreen(sql, "tvdash", "main", "detail");
  v = validateFlow(sql, "tvdash", "main");
  assert.equal(v.ok, false);
  assert.deepEqual(v.issues.map((x) => x.kind), ["dangling_link", "no_start_screen"]);
  assert.throws(() => validateFlow(sql, "tvdash", "ghost"), { message: 'unknown canvas "ghost"' });
});

test("readFlow: start, transition, screens with links, exists flags, back, tour and presenter", () => {
  const sql = setup();
  setFlow(sql, "tvdash", "main", { start_screen: "home", transition: "fade" });
  let f = readFlow(sql, "tvdash", "main");
  assert.equal(f.start_screen, "home");
  assert.equal(f.effective_start, "home");
  assert.equal(f.transition, "fade");
  assert.deepEqual(f.screens.map((s) => [s.id, s.back, s.links]), [
    ["home", false, [{ to: "detail", transition: null, exists: true }]],
    ["detail", true, [{ to: "home", transition: null, exists: true }]],
  ]);
  assert.equal(f.tour, null);
  assert.equal(f.presenter, null);
  setTour(sql, "tvdash", "main", [{ screen: "home", dwell_ms: 1000 }]);
  present(sql, "tvdash", { canvas: "main" });
  f = readFlow(sql, "tvdash", "main");
  assert.equal(f.tour?.duration_ms, 1000);
  assert.equal(f.presenter?.screen, "home");
  assert.equal(readFlow(setup([]), "tvdash", "main").effective_start, null);
});

test("applyEdits: exactly-once rule, all, order, not found, empty find", () => {
  assert.deepEqual(applyEdits("a b a", [{ find: "b", replace: "c" }]), { html: "a c a", replaced: [1] });
  assert.throws(() => applyEdits("a b a", [{ find: "a", replace: "x" }]), { message: "edit 0: find found 2 times: add context to make it unique or set all" });
  assert.deepEqual(applyEdits("a b a", [{ find: "a", replace: "x", all: true }]), { html: "x b x", replaced: [2] });
  assert.throws(() => applyEdits("abc", [{ find: "q", replace: "x" }]), { message: "edit 0: find not found" });
  assert.throws(() => applyEdits("abc", [{ find: "a", replace: "x" }, { find: "a", replace: "y" }]), { message: "edit 1: find not found" });
  assert.deepEqual(applyEdits("abc", [{ find: "a", replace: "b" }, { find: "bb", replace: "z" }]), { html: "zc", replaced: [1, 1] });
  assert.throws(() => applyEdits("abc", [{ find: "", replace: "x" }]), { message: "edit 0: find is empty" });
  assert.throws(() => applyEdits("abc", []), /invalid edits/);
  assert.throws(() => applyEdits("abc", Array(PATCH_EDITS_MAX + 1).fill({ find: "a", replace: "a" })), /invalid edits/);
});

test("applyEdits: replacement text is literal ($&, $1) and multibyte text works", () => {
  assert.equal(applyEdits("x", [{ find: "x", replace: "$& $1 $$" }]).html, "$& $1 $$");
  assert.equal(applyEdits("héllo wörld 日本", [{ find: "wörld 日本", replace: "🌍" }]).html, "héllo 🌍");
});

test("patchScreen: adds a link in one call, keeps name, size, position and order, one screen.set event, no html in it", () => {
  const sql = setup();
  setScreens(sql, "tvdash", "main", [{ ...mk("detail", `<a data-back>b</a><button>Pay</button>`), x: 700, y: -20 }], 4);
  const before = eventsAfter(sql, 0).length;
  const r = patchScreen(sql, "tvdash", "main", "detail", [{ find: "<button>", replace: `<button data-to="home" data-transition="fade">` }], 9);
  assert.equal(r.screen.updated_at, 9);
  assert.deepEqual([r.screen.name, r.screen.width, r.screen.height, r.screen.x, r.screen.y], ["detail", 400, 300, 700, -20]);
  assert.deepEqual(r.replaced, [1]);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.event.kind, "screen.set");
  assert.deepEqual(r.event.payload, { canvas: "main", id: "detail", name: "detail", width: 400, height: 300, bytes: r.bytes, created: false });
  assert.equal(eventsAfter(sql, 0).length, before + 1);
  const c = readCanvas(sql, "tvdash", "main", true);
  assert.deepEqual(c.screens.map((s) => s.id), ["home", "detail"]);
  assert.match(c.screens[1].html!, /data-to="home" data-transition="fade"/);
});

test("patchScreen: dangling warning, unknown screen, failed edit and size limit write nothing", () => {
  const sql = setup();
  const r = patchScreen(sql, "tvdash", "main", "home", [{ find: `data-to="detail"`, replace: `data-to="nope"` }]);
  assert.deepEqual(r.warnings, [`dangling link: data-to="nope" has no screen`]);
  const n = eventsAfter(sql, 0).length;
  assert.throws(() => patchScreen(sql, "tvdash", "main", "ghost", [{ find: "a", replace: "b" }]), { message: 'unknown screen "ghost" on canvas "main"' });
  assert.throws(() => patchScreen(sql, "tvdash", "main", "home", [{ find: "go", replace: "ok" }, { find: "zzz", replace: "" }]), { message: "edit 1: find not found" });
  assert.match(readCanvas(sql, "tvdash", "main", true).screens[0].html!, />go</);
  assert.throws(() => patchScreen(sql, "tvdash", "main", "home", [{ find: "go", replace: "x".repeat(200_001) }]), /screen too large/);
  assert.match(readCanvas(sql, "tvdash", "main", true).screens[0].html!, />go</);
  assert.equal(eventsAfter(sql, 0).length, n);
  assert.throws(() => patchScreen(sql, "tvdash", "ghost", "home", [{ find: "go", replace: "x" }]), { message: 'unknown canvas "ghost"' });
});

test("patchScreen: size limit counts bytes of multibyte text", () => {
  const sql = setup();
  assert.throws(() => patchScreen(sql, "tvdash", "main", "home", [{ find: "go", replace: "日".repeat(70_000) }]), /screen too large: \d+ bytes/);
});

test("checkTour and setTour: validation, event, clearing, replacing", () => {
  const sql = setup();
  assert.throws(() => checkTour("x"), /invalid steps/);
  assert.throws(() => checkTour(Array(TOUR_STEPS_MAX + 1).fill({ screen: "home", dwell_ms: 500 })), /invalid steps/);
  assert.throws(() => checkTour([{ screen: "home", dwell_ms: 10 }]), { message: "invalid step 0: dwell_ms must be an integer from 200 to 60000" });
  assert.throws(() => checkTour([{ screen: "home", dwell_ms: 500.5 }]), /invalid step 0: dwell_ms/);
  assert.throws(() => checkTour([{ screen: "home", dwell_ms: 500, note: "n".repeat(201) }]), /invalid step 0: note/);
  assert.throws(() => checkTour([{ screen: "Bad Id", dwell_ms: 500 }]), /invalid screen id/);
  assert.throws(() => setTour(sql, "tvdash", "main", [{ screen: "home", dwell_ms: 500 }, { screen: "ghost", dwell_ms: 500 }]), { message: 'unknown screen "ghost" in step 1' });
  assert.equal(readTour(sql, "tvdash", "main"), null);
  const r = setTour(sql, "tvdash", "main", [{ screen: "home", dwell_ms: 1500, note: "Start" }, { screen: "detail", dwell_ms: 2000, note: "" }]);
  assert.equal(r.duration_ms, 3500);
  assert.equal(r.event.kind, "tour.set");
  assert.deepEqual(r.event.payload, { canvas: "main", steps: [{ screen: "home", dwell_ms: 1500, note: "Start" }, { screen: "detail", dwell_ms: 2000 }] });
  assert.deepEqual(readTour(sql, "tvdash", "main")?.steps.length, 2);
  setTour(sql, "tvdash", "main", [{ screen: "detail", dwell_ms: 300 }]);
  assert.deepEqual(readTour(sql, "tvdash", "main")?.steps, [{ screen: "detail", dwell_ms: 300 }]);
  setTour(sql, "tvdash", "main", []);
  assert.equal(readTour(sql, "tvdash", "main"), null);
});

test("readTour: per canvas, and reports steps whose screen was removed", () => {
  const sql = setup();
  createCanvas(sql, "tvdash", { name: "Other" }, 5);
  setScreens(sql, "tvdash", "other", [mk("only", "<p>x</p>")], 6);
  setTour(sql, "tvdash", "main", [{ screen: "home", dwell_ms: 500 }, { screen: "detail", dwell_ms: 500 }]);
  assert.equal(readTour(sql, "tvdash", "other"), null);
  removeScreen(sql, "tvdash", "main", "detail");
  assert.deepEqual(readTour(sql, "tvdash", "main")?.missing, [1]);
});

test("tourPosition: boundaries, end, negative, empty", () => {
  const steps = [{ screen: "a", dwell_ms: 1000 }, { screen: "b", dwell_ms: 2000, note: "n" }];
  assert.deepEqual(tourPosition(steps, 0), { index: 0, step: steps[0], into_ms: 0, progress: 0, done: false });
  assert.equal(tourPosition(steps, 999)?.index, 0);
  assert.deepEqual(tourPosition(steps, 1000), { index: 1, step: steps[1], into_ms: 0, progress: 0, done: false });
  assert.equal(tourPosition(steps, 2000)?.progress, 0.5);
  assert.deepEqual(tourPosition(steps, 3000), { index: 1, step: steps[1], into_ms: 2000, progress: 1, done: true });
  assert.equal(tourPosition(steps, 99999)?.done, true);
  assert.equal(tourPosition(steps, -5)?.index, 0);
  assert.equal(tourPosition([], 10), null);
});

test("present: defaults to the start screen, else the first; validates; replaces an earlier session", () => {
  const sql = setup();
  assert.throws(() => present(sql, "tvdash", { canvas: "main", screen: "ghost" }), { message: 'unknown screen "ghost" on canvas "main"' });
  assert.throws(() => present(sql, "tvdash", { canvas: "ghost" }), { message: 'unknown canvas "ghost"' });
  const a = present(sql, "tvdash", { canvas: "main" });
  assert.deepEqual(a.presenter, { active: true, canvas: "main", screen: "home", transition: "none" });
  assert.equal(a.event.kind, "presenter.started");
  assert.deepEqual(a.event.payload, { canvas: "main", screen: "home", transition: "none" });
  setFlow(sql, "tvdash", "main", { start_screen: "detail" });
  assert.equal(present(sql, "tvdash", { canvas: "main" }).presenter.screen, "detail");
  assert.equal(present(sql, "tvdash", { canvas: "main", screen: "home" }).presenter.screen, "home");
  assert.throws(() => present(setup([]), "tvdash", { canvas: "main" }), { message: 'canvas "main" has no screens to present' });
});

test("goto: needs a session, checks the screen, uses the canvas default transition unless given", () => {
  const sql = setup();
  assert.throws(() => goto(sql, "tvdash", { screen: "home" }), { message: "not presenting: call present first" });
  present(sql, "tvdash", { canvas: "main" });
  setFlow(sql, "tvdash", "main", { transition: "push" });
  const g = goto(sql, "tvdash", { screen: "detail" });
  assert.deepEqual(g.event.payload, { canvas: "main", screen: "detail", transition: "push" });
  assert.equal(g.event.kind, "presenter.goto");
  assert.equal(goto(sql, "tvdash", { screen: "home", transition: "fade" }).presenter.transition, "fade");
  assert.throws(() => goto(sql, "tvdash", { screen: "ghost" }), { message: 'unknown screen "ghost" on canvas "main"' });
  assert.throws(() => goto(sql, "tvdash", { screen: "home", transition: "zoom" }), /invalid transition "zoom"/);
  assert.deepEqual(presenterState(sql, "tvdash"), { active: true, canvas: "main", screen: "home", transition: "fade" });
});

test("stopPresent: ends the session; stopping again is a no-op without an event; goto after a stop fails", () => {
  const sql = setup();
  assert.deepEqual(stopPresent(sql, "tvdash"), { presenter: { active: false }, event: null });
  present(sql, "tvdash", { canvas: "main" });
  const s = stopPresent(sql, "tvdash");
  assert.deepEqual(s.event?.payload, { canvas: "main" });
  assert.equal(s.event?.kind, "presenter.stopped");
  assert.equal(presenterState(sql, "tvdash")?.active, false);
  assert.equal(stopPresent(sql, "tvdash").event, null);
  assert.throws(() => goto(sql, "tvdash", { screen: "home" }), /not presenting/);
});

test("the session is per project and lives in the log: readCanvasForPage carries tour and presenter", () => {
  const sql = setup();
  openProject(sql, { name: "other", manifest: { tree: [], files: {} } }, 7);
  present(sql, "tvdash", { canvas: "main" });
  assert.equal(presenterState(sql, "other"), null);
  setTour(sql, "tvdash", "main", [{ screen: "home", dwell_ms: 500 }]);
  const page = readCanvasForPage(sql, "tvdash", "main");
  assert.equal(page.presenter?.screen, "home");
  assert.equal(page.tour?.steps.length, 1);
  assert.equal(page.screens[0].html, `<a data-to="detail">go</a>`);
});

test("applyPresenterEvent and followTarget: the page's pure follow logic", () => {
  const started = { kind: "presenter.started", payload: { canvas: "main", screen: "home", transition: "none" } };
  const go = { kind: "presenter.goto", payload: { canvas: "main", screen: "detail", transition: "slide-left" } };
  const stop = { kind: "presenter.stopped", payload: { canvas: "main" } };
  let st = applyPresenterEvent(null, started);
  assert.deepEqual(st, { active: true, canvas: "main", screen: "home", transition: "none" });
  st = applyPresenterEvent(st, go);
  assert.equal(st?.screen, "detail");
  st = applyPresenterEvent(st, stop);
  assert.deepEqual(st, { active: false, canvas: "main", screen: "detail", transition: "slide-left" });
  assert.deepEqual(applyPresenterEvent(null, stop), { active: false, canvas: "main", screen: "", transition: "none" });
  assert.equal(applyPresenterEvent(st, { kind: "ping" }), st);
  assert.deepEqual(applyPresenterEvent(null, { kind: "presenter.goto", payload: { canvas: "m", screen: "s", transition: "zoom" } })?.transition, "none");
  assert.deepEqual(followTarget(go, true), { canvas: "main", screen: "detail", transition: "slide-left" });
  assert.deepEqual(followTarget(started, true), { canvas: "main", screen: "home", transition: "none" });
  assert.equal(followTarget(go, false), null);
  assert.equal(followTarget(stop, true), null);
  assert.equal(followTarget({ kind: "screen.set", payload: {} }, true), null);
});

test("tool texts carry the limits and the error texts the code throws", () => {
  assert.match(FLOW_TEXT.patch_screen, /find not found/);
  assert.match(FLOW_TEXT.patch_screen, new RegExp(`1 to ${PATCH_EDITS_MAX}`));
  assert.match(FLOW_TEXT.set_tour, /200 to 60000/);
  assert.match(FLOW_TEXT.goto, /not presenting: call present first/);
  assert.match(FLOW_TEXT.validate_flow, /dangling_link/);
});
