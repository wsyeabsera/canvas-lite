import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas, removeCanvas, removeScreen, setFlow, setScreen, setScreens, type ScreenInput } from "../src/canvases.ts";
import { routeApi } from "../src/api.ts";
import { canvasAt, canvasTimeline } from "../src/timeline.ts";
import { openProject } from "../src/projects.ts";
import { appendEvent, MIGRATIONS, migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const scr = (o: Partial<ScreenInput> = {}): ScreenInput => ({ canvas: "main", name: "Home", width: 400, height: 300, html: "<p>v1</p>", ...o });
const withCanvas = () => {
  const sql = nodeSql();
  migrate(sql);
  openProject(sql, { name: "tvdash", manifest: { tree: [], files: {} } }, 1);
  createCanvas(sql, "tvdash", { name: "Main" }, 10);
  return sql;
};
const ids = (a: { screens: { id: string }[] }) => a.screens.map((s) => s.id);

test("migration 6 on a populated v5 database keeps data and backfills versions at each screen's latest screen.set seq", () => {
  const sql = nodeSql();
  sql.script("CREATE TABLE _migrations (version INTEGER PRIMARY KEY)");
  for (let v = 0; v < 5; v++) {
    sql.script(MIGRATIONS[v]);
    sql.run("INSERT INTO _migrations (version) VALUES (?)", v + 1);
  }
  sql.run("INSERT INTO projects (id, name, kind, repo, manifest, opened_at, archived_at) VALUES ('tvdash', 'TV', 'web', NULL, NULL, 5, NULL)");
  sql.run("INSERT INTO canvases (project, id, name, created_at, updated_at) VALUES ('tvdash', 'main', 'Main', 1, 2)");
  sql.run("INSERT INTO screens (project, canvas, id, name, width, height, html, updated_at) VALUES ('tvdash', 'main', 'home', 'Home', 400, 300, '<p>x</p>', 3)");
  sql.run("INSERT INTO screens (project, canvas, id, name, width, height, html, updated_at) VALUES ('tvdash', 'main', 'noevent', 'N', 100, 100, '', 3)");
  appendEvent(sql, { project: "tvdash", kind: "screen.set", payload: { canvas: "main", id: "home" } }, 3);
  const last = appendEvent(sql, { project: "tvdash", kind: "screen.set", payload: { canvas: "main", id: "home" } }, 4);
  migrate(sql);
  assert.equal(sql.all("SELECT 1 FROM projects").length, 1);
  assert.equal(sql.all("SELECT 1 FROM screens").length, 2);
  assert.deepEqual(
    sql.all<{ screen: string; seq: number; html: string }>("SELECT screen, seq, html FROM screen_versions ORDER BY screen").map((r) => ({ ...r })),
    [{ screen: "home", seq: last.seq, html: "<p>x</p>" }, { screen: "noevent", seq: 0, html: "" }],
  );
  assert.deepEqual(ids(canvasAt(sql, "tvdash", "main", last.seq)), ["noevent", "home"]);
  assert.deepEqual(ids(canvasAt(sql, "tvdash", "main", last.seq - 1)), ["noevent"], "before the backfilled version only the seq-0 screen exists");
});

test("timeline lists the canvas events oldest first, flow-only events carry no version", () => {
  const sql = withCanvas();
  const a = setScreen(sql, "tvdash", scr(), 20);
  const f = setFlow(sql, "tvdash", "main", { start_screen: "home", transition: "fade" }, 30);
  const b = setScreen(sql, "tvdash", scr({ name: "Two" }), 40);
  const r = removeScreen(sql, "tvdash", "main", "two", 50);
  createCanvas(sql, "tvdash", { name: "Other" }, 60);
  setScreen(sql, "tvdash", scr({ canvas: "other", name: "Z" }), 70);
  const t = canvasTimeline(sql, "tvdash", "main");
  assert.deepEqual(t.events.map((e) => [e.kind, e.screen, e.name, e.ts]), [
    ["canvas.created", null, null, 10],
    ["screen.set", "home", "Home", 20],
    ["flow.set", null, null, 30],
    ["screen.set", "two", "Two", 40],
    ["screen.removed", "two", "Two", 50],
  ]);
  assert.deepEqual(t.events.slice(1).map((e) => e.seq), [a.event.seq, f.event!.seq, b.event.seq, r.event!.seq]);
  assert.ok(t.events.every((e, i) => i === 0 || e.seq > t.events[i - 1].seq));
  const versions = sql.all<{ seq: number }>("SELECT seq FROM screen_versions WHERE canvas = 'main' ORDER BY seq").map((v) => v.seq);
  assert.deepEqual(versions, [a.event.seq, b.event.seq, r.event!.seq]);
  assert.throws(() => canvasTimeline(sql, "tvdash", "nope"), /unknown canvas "nope"/);
  assert.throws(() => canvasTimeline(sql, "ghost", "main"), /unknown project "ghost"/);
});

test("state at seq: screens, html, flow and order as they were", () => {
  const sql = withCanvas();
  const a = setScreen(sql, "tvdash", scr(), 20);
  const b = setScreens(sql, "tvdash", "main", [{ name: "Two", width: 200, height: 200, html: "<p>2</p>", x: 5, y: 6 }], 30).events[0];
  const f = setFlow(sql, "tvdash", "main", { start_screen: "two", transition: "push" }, 35).event!;
  const c = setScreen(sql, "tvdash", scr({ html: "<p>v2</p>" }), 40);
  const at = (s: number) => canvasAt(sql, "tvdash", "main", s);
  assert.deepEqual(at(0).screens, []);
  assert.equal(at(a.event.seq).screens[0].html, "<p>v1</p>");
  assert.equal(at(a.event.seq).ts, 20);
  assert.deepEqual([at(a.event.seq).start_screen, at(a.event.seq).transition], [null, "none"]);
  assert.deepEqual(ids(at(b.seq)), ["home", "two"]);
  assert.deepEqual([at(b.seq).screens[1].x, at(b.seq).screens[1].y, at(b.seq).screens[1].bytes], [5, 6, 8]);
  assert.deepEqual([at(f.seq).start_screen, at(f.seq).transition], ["two", "push"]);
  assert.equal(at(f.seq).screens[0].html, "<p>v1</p>", "flow event: screens unchanged");
  assert.equal(at(c.event.seq).screens[0].html, "<p>v2</p>");
  assert.equal(at(c.event.seq - 1).screens[0].html, "<p>v1</p>");
  assert.deepEqual(at(c.event.seq + 1000).screens.map((s) => s.html), ["<p>v2</p>", "<p>2</p>"]);
  assert.throws(() => canvasAt(sql, "tvdash", "main", -1), /invalid seq/);
  assert.throws(() => canvasAt(sql, "tvdash", "main", 1.5), /invalid seq/);
});

test("remove then recreate: absent between, new html after, order and start screen follow the live rules", () => {
  const sql = withCanvas();
  setScreen(sql, "tvdash", scr(), 20);
  const two = setScreen(sql, "tvdash", scr({ name: "Two" }), 21);
  setFlow(sql, "tvdash", "main", { start_screen: "home" }, 22);
  const rm = removeScreen(sql, "tvdash", "main", "home", 30).event!;
  const re = setScreen(sql, "tvdash", scr({ html: "<p>again</p>" }), 40);
  const at = (s: number) => canvasAt(sql, "tvdash", "main", s);
  assert.deepEqual(ids(at(two.event.seq)), ["home", "two"]);
  assert.equal(at(two.event.seq + 1).start_screen, "home");
  assert.deepEqual(ids(at(rm.seq)), ["two"]);
  assert.equal(at(rm.seq).start_screen, null);
  assert.deepEqual(ids(at(re.event.seq)), ["two", "home"], "a recreated screen is new, like the live rowid order");
  assert.equal(at(re.event.seq).screens[1].html, "<p>again</p>");
  assert.equal(at(re.event.seq).start_screen, null, "removal cleared the start screen and recreating does not bring it back");
});

test("a removed canvas has no timeline or state", () => {
  const sql = withCanvas();
  setScreen(sql, "tvdash", scr(), 20);
  removeCanvas(sql, "tvdash", "main", 30);
  assert.throws(() => canvasTimeline(sql, "tvdash", "main"), /unknown canvas/);
  assert.throws(() => canvasAt(sql, "tvdash", "main", 5), /unknown canvas/);
  assert.equal(sql.all("SELECT 1 FROM screen_versions").length, 1);
});

test("routes: timeline and at/<seq>", () => {
  assert.deepEqual(routeApi("GET", "/api/projects/p/canvases/main/timeline"), { kind: "timeline", id: "p", canvas: "main" });
  assert.deepEqual(routeApi("HEAD", "/api/projects/p/canvases/main/at/0"), { kind: "at", id: "p", canvas: "main", seq: 0 });
  assert.deepEqual(routeApi("GET", "/api/projects/p/canvases/main/at/12"), { kind: "at", id: "p", canvas: "main", seq: 12 });
  const s = (m: string, p: string) => {
    const r = routeApi(m, p);
    return r.kind === "error" ? r.status : r.kind;
  };
  for (const p of [
    "/api/projects/p/canvases/main/at", "/api/projects/p/canvases/main/at/", "/api/projects/p/canvases/main/at/-1", "/api/projects/p/canvases/main/at/1.5",
    "/api/projects/p/canvases/main/at/abc", "/api/projects/p/canvases/main/at/1234567890123456", "/api/projects/p/canvases/main/timeline/x",
    "/api/projects/p/canvases/main/at/1/x", "/api/projects/p/canvases/main/history", "/api/projects/p/canvases/Bad/timeline", "/api/projects/p/canvases//timeline",
  ])
    assert.equal(s("GET", p), 400, p);
  assert.equal(s("POST", "/api/projects/p/canvases/main/timeline"), 405);
  assert.equal(s("DELETE", "/api/projects/p/canvases/main/at/3"), 405);
});
