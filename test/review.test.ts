import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas, setFlow, setScreens } from "../src/canvases.ts";
import { FLOW_TEXT, reviewFlow, setTour } from "../src/flow.ts";
import { openProject } from "../src/projects.ts";
import { reviewPrototype, PASS_SCORE } from "../src/review.ts";
import { migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const s = (id: string, html: string, name = id) => ({ id, name, html });
const kinds = (r: ReturnType<typeof reviewPrototype>, severity?: string) => r.issues.filter((i) => !severity || i.severity === severity).map((i) => `${i.kind}:${i.screen ?? ""}`);
const nav = (...to: string[]) => to.map((t) => `<a data-to="${t}">${t}</a>`).join("");

test("empty canvas: error, score 0", () => {
  const r = reviewPrototype({ screens: [], start: null, tour: null });
  assert.deepEqual([r.score, r.ok, kinds(r)], [0, false, ["no_screens:"]]);
});

test("a complete, wired prototype passes with score >= 90", () => {
  const tour = [{ screen: "home" }, { screen: "list" }, { screen: "list-empty" }, { screen: "profile" }, { screen: "done-success" }];
  const bar = nav("home", "list", "profile");
  const r = reviewPrototype({
    screens: [
      s("home", `${bar}<a data-to="list-empty">e</a>`),
      s("list", `${bar}<a data-to="done-success">buy</a>`),
      s("profile", bar),
      s("list-empty", `<a data-back>b</a>`),
      s("done-success", `<a data-to="home">home</a>`),
    ],
    start: "home", tour, scenarios: [{ steps: tour }],
  });
  assert.deepEqual(r.issues, []);
  assert.equal(r.ok, true);
  assert.ok(r.score >= PASS_SCORE);
  assert.equal(r.stats.reachable, 5);
  assert.equal(r.stats.tour_screens, 5);
});

test("unreachable screen, no inbound link, each with a fix", () => {
  const r = reviewPrototype({ screens: [s("a", `<a data-to="b">`), s("b", `<a data-back>`), s("c", `<a data-to="a">`)], start: "a", tour: null });
  assert.deepEqual(kinds(r, "warning"), ["unreachable:c", "no_inbound_link:c"]);
  assert.equal(r.ok, false);
  assert.match(r.issues.find((i) => i.kind === "unreachable")!.fix, /data-to="c"/);
  assert.ok(r.issues.every((i) => i.fix.length > 0));
});

test("an unreachable cycle has inbound links but is still unreachable", () => {
  const r = reviewPrototype({ screens: [s("a", `<a data-back>`), s("c", `<a data-to="d">`), s("d", `<a data-to="c">`)], start: "a", tour: null });
  assert.deepEqual(kinds(r, "warning"), ["unreachable:c", "unreachable:d"]);
});

test("dead end is a warning; data-back or a link is not a dead end", () => {
  const r = reviewPrototype({ screens: [s("a", `<a data-to="b"><a data-to="c">`), s("b", `<p>end</p>`), s("c", `<a data-back>`)], start: "a", tour: null });
  assert.deepEqual(kinds(r, "warning"), ["dead_end:b"]);
});

test("dangling link is an error; unlinked control is a warning using coverage", () => {
  const r = reviewPrototype({ screens: [s("a", `<a data-to="ghost">x</a><button>Pay</button><button data-inert>no</button>`)], start: "a", tour: null });
  assert.deepEqual(kinds(r, "error"), ["dangling_link:a"]);
  assert.deepEqual(kinds(r, "warning"), ["unlinked_control:a"]);
  assert.match(r.issues.find((i) => i.kind === "unlinked_control")!.message, /Pay/);
  assert.equal(r.stats.unlinked, 1);
  assert.equal(r.score, 100 - 15 - 6 - 1 /* no_tour */);
});

test("nav differs: one screen lacks an item of the shared bar (the current tab may omit itself)", () => {
  const four = ["home", "search", "inbox", "me"];
  const bar = (self: string, drop?: string) => nav(...four.filter((t) => t !== self && t !== drop));
  const r = reviewPrototype({
    screens: [s("home", bar("home")), s("search", bar("search")), s("inbox", bar("inbox", "me")), s("me", bar("me"))],
    start: "home", tour: null,
  });
  const nd = r.issues.filter((i) => i.kind === "nav_differs");
  assert.deepEqual(nd.map((i) => i.screen), ["inbox"]);
  assert.match(nd[0].message, /nav bar differs on screen "inbox"/);
  assert.match(nd[0].message, /"me"/);
  assert.equal(r.stats.nav_sets, 1);
});

test("consistent bar or fewer than 3 shared targets: no nav issue", () => {
  const ok = reviewPrototype({ screens: [s("a", nav("b", "c", "d")), s("b", nav("a", "c", "d")), s("c", nav("a", "b", "d")), s("d", nav("a", "b", "c"))], start: "a", tour: null });
  assert.equal(ok.issues.some((i) => i.kind === "nav_differs"), false);
  const two = reviewPrototype({ screens: [s("a", nav("b", "c")), s("b", nav("a")), s("c", nav("a"))], start: "a", tour: null });
  assert.equal(two.stats.nav_sets, 0);
});

test("no way back is info: not the start, no data-back, no path towards the start", () => {
  const r = reviewPrototype({ screens: [s("a", nav("b")), s("b", nav("c")), s("c", nav("b")), s("d", nav("a"))], start: "a", tour: null });
  assert.deepEqual(kinds(r, "info").filter((k) => k.startsWith("no_way_back")), ["no_way_back:b", "no_way_back:c"]);
  assert.equal(kinds(r, "warning").includes("no_way_back:d"), false);
});

test("missing state: advisory only with 4+ screens, matched on name or id", () => {
  const four = [s("a", nav("b")), s("b", nav("c")), s("c", nav("d")), s("d", nav("a"))];
  assert.ok(kinds(reviewPrototype({ screens: four, start: "a", tour: null }), "info").includes("missing_state:"));
  assert.equal(kinds(reviewPrototype({ screens: four.slice(0, 3), start: "a", tour: null })).includes("missing_state:"), false);
  const named = four.map((x, i) => (i === 3 ? { ...x, name: "Loading list" } : x));
  assert.equal(kinds(reviewPrototype({ screens: named, start: "a", tour: null })).includes("missing_state:"), false);
});

test("tour coverage: no tour, and screens no step visits", () => {
  const screens = [s("a", nav("b")), s("b", `<a data-back>`)];
  assert.deepEqual(kinds(reviewPrototype({ screens, start: "a", tour: null }), "info"), ["no_tour:"]);
  assert.deepEqual(kinds(reviewPrototype({ screens, start: "a", tour: [{ screen: "a" }] }), "info"), ["tour_skips_screen:b"]);
});

test("scenario coverage: a screen visited by tour or any scenario is covered; no_scenarios at 4+ screens", () => {
  const screens = [s("a", nav("b")), s("b", `<a data-back>`)];
  const sc = (...ids: string[]) => [{ steps: ids.map((screen) => ({ screen })) }];
  assert.deepEqual(kinds(reviewPrototype({ screens, start: "a", tour: null, scenarios: sc("a") }), "info"), ["scenario_skips_screen:b"]);
  assert.deepEqual(kinds(reviewPrototype({ screens, start: "a", tour: [{ screen: "b" }], scenarios: sc("a") }), "info"), []);
  assert.deepEqual(kinds(reviewPrototype({ screens, start: "a", tour: null, scenarios: [...sc("a"), ...sc("b")] }), "info"), []);
  const four = [s("a", nav("b")), s("b", nav("c")), s("c", nav("d")), s("d", nav("a"))];
  assert.ok(kinds(reviewPrototype({ screens: four, start: "a", tour: [{ screen: "a" }, { screen: "b" }, { screen: "c" }, { screen: "d" }] }), "info").includes("no_scenarios:"));
  assert.equal(reviewPrototype({ screens, start: "a", tour: null }).issues.some((i) => i.kind === "no_scenarios"), false);
});

test("no valid start screen is a warning and falls back to the first screen", () => {
  const r = reviewPrototype({ screens: [s("a", nav("b")), s("b", `<a data-back>`)], start: "gone", tour: null });
  assert.deepEqual(kinds(r, "warning"), ["no_start_screen:a"]);
});

test("score: errors weigh most, clamps at 0", () => {
  const many = Array.from({ length: 10 }, (_, i) => s(`x${i}`, `<a data-to="nope${i}">`));
  assert.equal(reviewPrototype({ screens: many, start: "x0", tour: null }).score, 0);
});

test("reviewFlow end to end: reads screens, start and tour from the log", () => {
  const sql = nodeSql();
  migrate(sql);
  openProject(sql, { name: "tvdash", manifest: { tree: [], files: {} } }, 1);
  createCanvas(sql, "tvdash", { name: "Main" }, 2);
  const mk = (id: string, html: string) => ({ id, name: id, width: 400, height: 300, html });
  setScreens(sql, "tvdash", "main", [mk("a", nav("b")), mk("b", `<a data-back>x</a>`), mk("c", `<p>lost</p>`)], 3);
  setFlow(sql, "tvdash", "main", { start_screen: "a" }, 4);
  const before = reviewFlow(sql, "tvdash", "main");
  assert.equal(before.canvas, "main");
  assert.deepEqual(kinds(before, "warning"), ["unreachable:c", "no_inbound_link:c", "dead_end:c"]);
  setScreens(sql, "tvdash", "main", [mk("c", `<a data-back>x</a>`), mk("b", nav("c") + `<a data-back>x</a>`)], 5);
  setTour(sql, "tvdash", "main", [{ screen: "a", dwell_ms: 500 }, { screen: "b", dwell_ms: 500 }, { screen: "c", dwell_ms: 500 }], 6);
  const after = reviewFlow(sql, "tvdash", "main");
  assert.equal(after.ok, true);
  assert.equal(after.stats.tour_steps, 3);
  assert.ok(after.score >= PASS_SCORE);
});

test("tool text tells Claude to run it after validate_flow and loop to ok and score >= 90", () => {
  assert.match(FLOW_TEXT.review_prototype, /after validate_flow/);
  assert.match(FLOW_TEXT.review_prototype, /score is at least 90/);
  assert.match(FLOW_TEXT.review_prototype, /never present a half-finished prototype/);
});

test("nav: unrelated content links that share a target are not chained into one fake bar", () => {
  // A real 4-item toolbar on `home` and `home2`, and two browser screens that share three other targets: the old merging
  // chained both groups through one shared target and asked every screen for all of the items.
  const bar = nav("t1", "t2", "t3", "t4");
  const r = reviewPrototype({
    screens: [
      s("home", bar), s("home2", bar),
      s("b1", nav("x", "y", "t1")), s("b2", nav("x", "y", "t1", "z")),
      s("t1", nav("home")), s("t2", nav("home")), s("t3", nav("home")), s("t4", nav("home")), s("x", nav("home")), s("y", nav("home")), s("z", nav("home")),
    ],
    start: "home",
    tour: null,
  });
  assert.deepEqual(r.issues.filter((i) => i.kind === "nav_differs").map((i) => i.screen), []);
});
