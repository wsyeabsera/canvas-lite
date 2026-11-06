import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFilter, badgeOf, bannerModel, continueModel, describeEntries, filterCounts, filterByProject, foldSession, metaLine, parseLast, projectOptions, rememberRoute, rememberScreen, resolveProject,
  searchEntries, showProjectPicker, sortEntries, startScreenOf, thumbFit, type Entry, type Sessions,
} from "../web/landing.ts";

const e = (o: Partial<Entry> = {}): Entry => ({ pid: "tv", project: "TV", id: "main", name: "Main", screens: 3, updated_at: 1000, start_screen: null, dangling: 0, unlinked: 0, ...o });

test("describeEntries tolerates gaps and older servers", () => {
  const l = describeEntries("tv", "TV", { canvases: [{ id: "a", name: "A", screens: 2, updated_at: 5, start_screen: "s", dangling: 1, unlinked: 2 }, { id: "b" }, { nope: 1 }] });
  assert.equal(l.length, 2);
  assert.deepEqual([l[0].start_screen, l[0].dangling, l[0].unlinked], ["s", 1, 2]);
  assert.deepEqual([l[1].name, l[1].screens, l[1].dangling], ["b", 0, 0]);
  assert.deepEqual(describeEntries("tv", "TV", null), []);
});

test("badge: playable, N missing links (dangling + unlinked), empty", () => {
  assert.deepEqual(badgeOf(e()), { kind: "playable", text: "Playable" });
  assert.deepEqual(badgeOf(e({ dangling: 1, unlinked: 2 })), { kind: "missing", text: "3 missing links" });
  assert.equal(badgeOf(e({ unlinked: 1 })).text, "1 missing link");
  assert.equal(badgeOf(e({ screens: 0 })).kind, "empty");
});

test("filters and their counts", () => {
  const list = [e({ id: "a" }), e({ id: "b", unlinked: 2 }), e({ id: "c", screens: 0 }), e({ id: "d", dangling: 1 })];
  assert.deepEqual(filterCounts(list), { all: 4, playable: 1, needs: 2 });
  assert.deepEqual(applyFilter(list, "playable").map((x) => x.id), ["a"]);
  assert.deepEqual(applyFilter(list, "needs").map((x) => x.id), ["b", "d"]);
  assert.equal(applyFilter(list, "all").length, 4);
});

test("search matches every word in design or project name, case-insensitive", () => {
  const list = [e({ id: "a", name: "Checkout flow" }), e({ id: "b", name: "Home", project: "Shop App" })];
  assert.deepEqual(searchEntries(list, "CHECK").map((x) => x.id), ["a"]);
  assert.deepEqual(searchEntries(list, "shop home").map((x) => x.id), ["b"]);
  assert.deepEqual(searchEntries(list, "shop checkout").map((x) => x.id), []);
  assert.equal(searchEntries(list, "  ").length, 2);
});

test("sortEntries: one flat list, newest first, ties by name then project", () => {
  const list = [e({ pid: "z", project: "Zed", id: "1", name: "B", updated_at: 1 }), e({ pid: "a", project: "Alpha", id: "old", name: "A", updated_at: 1 }), e({ pid: "a", project: "Alpha", id: "new", name: "C", updated_at: 9 })];
  assert.deepEqual(sortEntries(list).map((x) => x.id), ["new", "old", "1"]);
  assert.deepEqual(list.map((x) => x.id), ["1", "old", "new"], "input untouched");
  assert.deepEqual(sortEntries([]), []);
});

test("search also matches the project name", () => {
  const list = [e({ id: "a", name: "TV prototype", project: "tvdash" }), e({ id: "b", name: "Home", project: "Shop" })];
  assert.deepEqual(searchEntries(list, "tvdash").map((x) => x.id), ["a"]);
  assert.deepEqual(searchEntries(list, "home shop").map((x) => x.id), ["b"]);
});

test("project dropdown: options with counts, hidden for one project, saved choice, filtering", () => {
  const list = [e({ pid: "z", project: "Zed", id: "1" }), e({ pid: "a", project: "tvdash", id: "2" }), e({ pid: "a", project: "tvdash", id: "3" })];
  const o = projectOptions(list);
  assert.deepEqual(o, [{ value: "", label: "All projects" }, { value: "a", label: "tvdash (2)" }, { value: "z", label: "Zed (1)" }]);
  assert.equal(showProjectPicker(o), true);
  assert.equal(showProjectPicker(projectOptions([list[0]])), false);
  assert.equal(showProjectPicker(projectOptions([])), false);
  assert.equal(resolveProject("a", o), "a");
  assert.equal(resolveProject("gone", o), "");
  assert.equal(resolveProject(null, o), "");
  assert.deepEqual(filterByProject(list, "a").map((x) => x.id), ["2", "3"]);
  assert.equal(filterByProject(list, "").length, 3);
  assert.equal(filterCounts(filterByProject(list, "z")).all, 1);
});

test("metaLine and thumbFit", () => {
  assert.equal(metaLine({ screens: 12, updated_at: 0 }, 3_600_000), "12 screens · updated 1 h ago");
  assert.equal(metaLine({ screens: 1, updated_at: 0 }, 1000), "1 screen · updated just now");
  const f = thumbFit(1920, 1080, 280, 150);
  assert.ok(Math.abs(f.scale - 150 / 1080) < 1e-9 || Math.abs(f.scale - 280 / 1920) < 1e-9);
  assert.ok(f.left >= 0 && f.top >= 0);
  assert.deepEqual(thumbFit(400, 400, 100, 200), { scale: 0.25, left: 0, top: 50 });
  assert.deepEqual(thumbFit(0, 10, 10, 10), { scale: 1, left: 0, top: 0 });
});

test("startScreenOf falls back to the first screen", () => {
  const s = [{ id: "a" }, { id: "b" }];
  assert.equal(startScreenOf(s, "b")?.id, "b");
  assert.equal(startScreenOf(s, "zzz")?.id, "a");
  assert.equal(startScreenOf(s, null)?.id, "a");
  assert.equal(startScreenOf([], null), null);
});

test("parseLast rejects junk and bad ids", () => {
  assert.deepEqual(parseLast('{"project":"tv","canvas":"main","screen":"s1","ts":5}'), { project: "tv", canvas: "main", screen: "s1", ts: 5 });
  assert.equal(parseLast('{"project":"tv","canvas":"main","screen":"BAD ID"}')?.screen, null);
  for (const bad of [null, "", "x", "{}", '{"project":"A","canvas":"main"}', '{"project":"tv"}']) assert.equal(parseLast(bad), null, String(bad));
});

test("rememberRoute: play and screen remember the screen, canvas keeps it for the same canvas, others change nothing", () => {
  const a = rememberRoute(null, { view: "play", id: "tv", canvas: "main", screen: "s2" }, 7);
  assert.deepEqual(a, { project: "tv", canvas: "main", screen: "s2", ts: 7 });
  assert.deepEqual(rememberRoute(a, { view: "canvas", id: "tv", canvas: "main" }, 8), { project: "tv", canvas: "main", screen: "s2", ts: 8 });
  assert.deepEqual(rememberRoute(a, { view: "canvas", id: "tv", canvas: "other" }, 9), { project: "tv", canvas: "other", screen: null, ts: 9 });
  assert.equal(rememberRoute(a, { view: "landing" }, 10), a);
  assert.equal(rememberRoute(a, { view: "project", id: "tv" }, 10), a);
  assert.deepEqual(rememberScreen("tv", "main", "s3", 11), { project: "tv", canvas: "main", screen: "s3", ts: 11 });
});

test("continueModel: text, missing canvas, unknown screen id", () => {
  const list = [e({ screens: 12 })];
  const last = { project: "tv", canvas: "main", screen: "pay", ts: 0 };
  assert.equal(continueModel(last, list, (id) => (id === "pay" ? "Payment" : null), 5 * 60_000)?.text, "12 screens · you stopped at Payment · 5 min ago");
  assert.equal(continueModel(last, list, () => null, 60_000)?.text, "12 screens · you stopped at pay · 1 min ago");
  assert.equal(continueModel({ ...last, screen: null }, list, () => null, 0)?.text, "12 screens · just now");
  assert.equal(continueModel({ ...last, canvas: "gone" }, list, () => null, 0), null);
  assert.equal(continueModel(null, list, () => null, 0), null);
});

test("presenter sessions fold across projects and drive the banner", () => {
  let s: Sessions = {};
  const row = (kind: string, project: string, payload: unknown, ts: number) => ({ kind, project, payload, ts });
  s = foldSession(s, row("presenter.started", "tv", { canvas: "main", screen: "a" }, 1));
  s = foldSession(s, row("presenter.goto", "tv", { canvas: "main", screen: "b" }, 2));
  s = foldSession(s, row("presenter.started", "other", { canvas: "x", screen: "q" }, 3));
  const list = [e({ screens: 4 }), e({ pid: "other", project: "O", id: "x", name: "Ex", screens: 2 })];
  assert.deepEqual(bannerModel(s, list), { pid: "other", canvas: "x", name: "Ex", text: "Ex, step 1 of 2" });
  s = foldSession(s, row("presenter.stopped", "other", { canvas: "x" }, 4));
  assert.equal(bannerModel(s, list)?.text, "Main, step 2 of 4");
  s = foldSession(s, row("presenter.stopped", "tv", { canvas: "main" }, 5));
  assert.equal(bannerModel(s, list), null);
  assert.equal(foldSession(s, row("canvas.created", "tv", {}, 6)), s);
  assert.equal(bannerModel({ tv: { active: true, canvas: "gone", screen: "a", visited: ["a"], ts: 1 } }, list), null);
});
