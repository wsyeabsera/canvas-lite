import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas, extractLinks, readCanvas, removeScreen, setFlow, setScreen, setScreens, type ScreenInput } from "../src/canvases.ts";
import { openProject } from "../src/projects.ts";
import { eventsAfter, MIGRATIONS, migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const scr = (o: Partial<ScreenInput> = {}): ScreenInput => ({ canvas: "main", name: "Home", width: 400, height: 300, html: "<p>hi</p>", ...o });
const withCanvas = () => {
  const sql = nodeSql();
  migrate(sql);
  openProject(sql, { name: "tvdash", manifest: { tree: [], files: {} } }, 1);
  createCanvas(sql, "tvdash", { name: "Main" }, 10);
  return sql;
};

test("migration 5 on a populated v4 database keeps canvases and screens, defaults transition to none and checks it", () => {
  const sql = nodeSql();
  sql.script("CREATE TABLE _migrations (version INTEGER PRIMARY KEY)");
  for (let v = 0; v < 4; v++) {
    sql.script(MIGRATIONS[v]);
    sql.run("INSERT INTO _migrations (version) VALUES (?)", v + 1);
  }
  sql.run("INSERT INTO projects (id, name, kind, repo, manifest, opened_at, archived_at) VALUES ('tvdash', 'TV', 'web', NULL, NULL, 5, NULL)");
  sql.run("INSERT INTO canvases (project, id, name, created_at, updated_at) VALUES ('tvdash', 'main', 'Main', 1, 2)");
  sql.run("INSERT INTO screens (project, canvas, id, name, width, height, html, updated_at) VALUES ('tvdash', 'main', 'home', 'Home', 400, 300, '<p>x</p>', 3)");
  migrate(sql);
  assert.deepEqual(sql.all<{ version: number }>("SELECT version FROM _migrations ORDER BY version").map((r) => r.version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const r = readCanvas(sql, "tvdash", "main", true);
  assert.deepEqual(r.canvas, { id: "main", name: "Main", screens: 1, created_at: 1, updated_at: 2, start_screen: null, transition: "none" });
  assert.equal(r.screens[0].html, "<p>x</p>");
  assert.throws(() => sql.run("UPDATE canvases SET transition = 'zoom' WHERE id = 'main'"), /CHECK/);
  sql.run("UPDATE canvases SET transition = 'push', start_screen = 'home' WHERE id = 'main'");
  assert.equal(readCanvas(sql, "tvdash", "main").canvas.transition, "push");
});

test("extractLinks: data-to with optional data-transition, any quoting, tolerant of malformed html", () => {
  assert.deepEqual(extractLinks(`<a data-to="b">x</a><button DATA-TO='c' data-transition="fade">`), [
    { to: "b", transition: null },
    { to: "c", transition: "fade" },
  ]);
  assert.deepEqual(extractLinks(`<div data-to=d data-transition=push>`), [{ to: "d", transition: "push" }]);
  assert.deepEqual(extractLinks(`<a title="a > b" data-to="e">`), [{ to: "e", transition: null }]);
  assert.deepEqual(extractLinks(`<!-- <a data-to="gone"> --><a data-back>back</a><a data-to="">`), []);
  assert.deepEqual(extractLinks(`<a data-to="ok"><p <div data-to="half`), [{ to: "ok", transition: null }]);
  assert.deepEqual(extractLinks(""), []);
  assert.deepEqual(extractLinks('plain data-to="x" text'), []);
});

test("set_screen and set_screens warn about dangling data-to; a forward link inside one batch is fine", () => {
  const sql = withCanvas();
  const r = setScreen(sql, "tvdash", scr({ html: `<a data-to="next">go</a><a data-to="next">again</a>` }), 20);
  assert.deepEqual(r.warnings, [`dangling link: data-to="next" has no screen`]);
  assert.deepEqual(setScreen(sql, "tvdash", scr({ name: "Next", html: `<a data-to="home">back</a>` }), 21).warnings, []);
  const b = setScreens(sql, "tvdash", "main", [
    { name: "A", width: 400, height: 300, html: `<a data-to="b">b</a><a data-to="zzz">z</a>` },
    { name: "B", width: 400, height: 300, html: `<a data-to="a">a</a>` },
  ], 22);
  assert.deepEqual(b.screens.map((s) => s.warnings), [[`dangling link: data-to="zzz" has no screen`], []]);
});

test("set_flow: stores start screen and transition, validates both, appends flow.set, no-op is silent", () => {
  const sql = withCanvas();
  setScreen(sql, "tvdash", scr(), 11);
  assert.throws(() => setFlow(sql, "tvdash", "main", {}), /invalid flow/);
  assert.throws(() => setFlow(sql, "tvdash", "main", { transition: "zoom" }), /invalid transition "zoom": use none, fade, slide-left, slide-right, push/);
  assert.throws(() => setFlow(sql, "tvdash", "main", { start_screen: "ghost" }), /unknown screen "ghost"/);
  assert.throws(() => setFlow(sql, "tvdash", "nope", { transition: "fade" }), /unknown canvas/);
  const r = setFlow(sql, "tvdash", "main", { start_screen: "home", transition: "slide-left" }, 30);
  assert.deepEqual(r.flow, { canvas: "main", start_screen: "home", transition: "slide-left" });
  assert.equal(r.event?.kind, "flow.set");
  assert.deepEqual(r.event?.payload, r.flow);
  const c = readCanvas(sql, "tvdash", "main").canvas;
  assert.deepEqual([c.start_screen, c.transition, c.updated_at], ["home", "slide-left", 30]);
  const n = eventsAfter(sql).length;
  assert.equal(setFlow(sql, "tvdash", "main", { transition: "slide-left" }, 31).event, null);
  assert.equal(eventsAfter(sql).length, n);
  setFlow(sql, "tvdash", "main", { start_screen: null }, 32);
  assert.equal(readCanvas(sql, "tvdash", "main").canvas.start_screen, null);
});

test("removing the start screen clears start_screen", () => {
  const sql = withCanvas();
  setScreen(sql, "tvdash", scr(), 11);
  setFlow(sql, "tvdash", "main", { start_screen: "home" }, 12);
  removeScreen(sql, "tvdash", "main", "home", 13);
  assert.equal(readCanvas(sql, "tvdash", "main").canvas.start_screen, null);
});
