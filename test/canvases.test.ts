import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANVAS_TEXT, CANVASES_PER_PROJECT, SCREEN_HTML_LIMIT, SCREENS_PER_CANVAS,
  createCanvas, listCanvases, readCanvas, removeCanvas, removeScreen, screenWarnings, setScreen, setScreens, SCREENS_PER_CALL, type ScreenInput,
} from "../src/canvases.ts";
import { layoutScreens as webLayout } from "../web/layout.ts";
import { openProject, removeProject } from "../src/projects.ts";
import { appendEvent, eventsAfter, MIGRATIONS, migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const fresh = () => {
  const sql = nodeSql();
  migrate(sql);
  openProject(sql, { name: "tvdash", manifest: { tree: [], files: {} } }, 1);
  return sql;
};
const scr = (o: Partial<ScreenInput> = {}): ScreenInput => ({ canvas: "main", name: "Home", width: 400, height: 300, html: "<p>hi</p>", ...o });
const withCanvas = () => {
  const sql = fresh();
  createCanvas(sql, "tvdash", { name: "Main" }, 10);
  return sql;
};
const kinds = (sql: ReturnType<typeof fresh>) => eventsAfter(sql).map((e) => e.kind);

test("migration 4 on a populated v3 database keeps projects, events and triggers and adds canvas tables", () => {
  const sql = nodeSql();
  sql.script("CREATE TABLE _migrations (version INTEGER PRIMARY KEY)");
  for (let v = 0; v < 3; v++) {
    sql.script(MIGRATIONS[v]);
    sql.run("INSERT INTO _migrations (version) VALUES (?)", v + 1);
  }
  sql.run("INSERT INTO projects (id, name, kind, repo, manifest, opened_at, archived_at) VALUES ('tvdash', 'TV', 'web', NULL, NULL, 5, NULL)");
  sql.run("INSERT INTO projects (id, name, kind, repo, manifest, opened_at, archived_at) VALUES ('old', 'Old', 'web', NULL, NULL, 6, 9)");
  const a = appendEvent(sql, { project: "tvdash", kind: "x", payload: { n: 1 } }, 7);
  migrate(sql);
  assert.deepEqual(sql.all<{ version: number }>("SELECT version FROM _migrations ORDER BY version").map((r) => r.version), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(sql.all<{ id: string; archived_at: number | null }>("SELECT id, archived_at FROM projects ORDER BY id").map((r) => ({ ...r })), [
    { id: "old", archived_at: 9 },
    { id: "tvdash", archived_at: null },
  ]);
  assert.deepEqual(eventsAfter(sql).map((e) => [e.seq, e.project, e.payload]), [[a.seq, "tvdash", { n: 1 }]]);
  assert.throws(() => sql.run("UPDATE events SET kind = 'x' WHERE seq = ?", a.seq), /append-only/);
  assert.throws(() => sql.run("DELETE FROM events WHERE seq = ?", a.seq), /append-only/);
  assert.deepEqual(
    sql.all<{ name: string }>("SELECT name FROM pragma_table_info('canvases') ORDER BY cid").map((c) => c.name),
    ["project", "id", "name", "created_at", "updated_at", "archived_at", "start_screen", "transition"],
  );
  assert.deepEqual(
    sql.all<{ name: string }>("SELECT name FROM pragma_table_info('screens') ORDER BY cid").map((c) => c.name),
    ["project", "canvas", "id", "name", "width", "height", "html", "x", "y", "updated_at"],
  );
  const canvas = (p: string, id: string) => sql.run("INSERT INTO canvases (project, id, name, created_at, updated_at) VALUES (?, ?, 'n', 0, 0)", p, id);
  assert.throws(() => canvas("nope", "c"), /FOREIGN KEY/);
  assert.throws(() => canvas("tvdash", "Bad"), /CHECK/);
  canvas("tvdash", "c");
  const screen = (w: number, id = "s", c = "c") =>
    sql.run("INSERT INTO screens (project, canvas, id, name, width, height, html, updated_at) VALUES ('tvdash', ?, ?, 'n', ?, 100, '', 0)", c, id, w);
  assert.throws(() => screen(99), /CHECK/);
  assert.throws(() => screen(8001), /CHECK/);
  assert.throws(() => screen(100, "s", "missing"), /FOREIGN KEY/);
  screen(100);
  assert.throws(() => screen(100), /UNIQUE|PRIMARY/);
});

test("create_canvas: defaults id to the slug, appends canvas.created with the project", () => {
  const sql = fresh();
  const r = createCanvas(sql, "tvdash", { name: "Main Board" }, 10);
  assert.deepEqual(r.canvas, { id: "main-board", name: "Main Board", screens: 0, created_at: 10, updated_at: 10 });
  assert.equal(r.event?.kind, "canvas.created");
  assert.equal(r.event?.project, "tvdash");
  assert.deepEqual(r.event?.payload, { canvas: "main-board", name: "Main Board" });
  assert.equal(eventsAfter(sql).at(-1)?.seq, r.event?.seq);
});

test("create_canvas is idempotent: existing = no event; removed = un-archived with a new event", () => {
  const sql = withCanvas();
  const n = eventsAfter(sql).length;
  const again = createCanvas(sql, "tvdash", { name: "Other name", id: "main" }, 20);
  assert.equal(again.event, null);
  assert.equal(again.canvas.name, "Main");
  assert.equal(eventsAfter(sql).length, n);
  removeCanvas(sql, "tvdash", "main", 30);
  assert.equal(listCanvases(sql, "tvdash").canvases.length, 0);
  const back = createCanvas(sql, "tvdash", { name: "Main" }, 40);
  assert.equal(back.event?.kind, "canvas.created");
  assert.equal(back.canvas.created_at, 10);
  assert.deepEqual(listCanvases(sql, "tvdash").canvases.map((c) => c.id), ["main"]);
});

test("unknown or archived project", () => {
  const sql = withCanvas();
  const msg = { message: 'unknown project "nope"' };
  assert.throws(() => createCanvas(sql, "nope", { name: "x" }), msg);
  assert.throws(() => listCanvases(sql, "nope"), msg);
  assert.throws(() => readCanvas(sql, "nope", "main"), msg);
  assert.throws(() => setScreen(sql, "nope", scr()), msg);
  assert.throws(() => removeScreen(sql, "nope", "main", "home"), msg);
  assert.throws(() => removeCanvas(sql, "nope", "main"), msg);
  removeProject(sql, "tvdash");
  assert.throws(() => listCanvases(sql, "tvdash"), { message: 'unknown project "tvdash"' });
  assert.throws(() => setScreen(sql, "tvdash", scr()), { message: 'unknown project "tvdash"' });
});

test("canvas name and id validation", () => {
  const sql = fresh();
  assert.throws(() => createCanvas(sql, "tvdash", { name: "" }), /invalid name/);
  assert.throws(() => createCanvas(sql, "tvdash", { name: "  " }), /invalid name/);
  assert.throws(() => createCanvas(sql, "tvdash", { name: "n".repeat(101) }), /invalid name/);
  assert.throws(() => createCanvas(sql, "tvdash", { name: 5 as any }), /invalid name/);
  assert.equal(createCanvas(sql, "tvdash", { name: "n".repeat(100), id: "ok" }).canvas.name.length, 100);
  for (const bad of ["Bad_Id", "", "..", "../x", "-x", "a b", "x".repeat(41)])
    assert.throws(() => createCanvas(sql, "tvdash", { name: "n", id: bad }), { message: `invalid canvas id "${bad}": use lowercase letters, digits and -, at most 40` }, bad);
  assert.throws(() => createCanvas(sql, "tvdash", { name: "!!!" }), /invalid canvas id ""/);
});

test("canvas limit: 20 live canvases; removed ones free a slot, un-archive respects the limit", () => {
  const sql = fresh();
  for (let i = 0; i < CANVASES_PER_PROJECT; i++) createCanvas(sql, "tvdash", { name: `c${i}` });
  assert.throws(() => createCanvas(sql, "tvdash", { name: "extra" }), { message: "too many canvases: limit 20" });
  assert.equal(createCanvas(sql, "tvdash", { name: "c0" }).event, null); // existing: still a no-op at the limit
  removeCanvas(sql, "tvdash", "c0");
  createCanvas(sql, "tvdash", { name: "extra" });
  assert.throws(() => createCanvas(sql, "tvdash", { name: "c0" }), { message: "too many canvases: limit 20" });
  assert.equal(listCanvases(sql, "tvdash").canvases.length, 20);
});

test("set_screen: creates, defaults id to slug, appends screen.set without html", () => {
  const sql = withCanvas();
  const r = setScreen(sql, "tvdash", scr({ x: 10, y: -5 }), 50);
  assert.equal(r.created, true);
  assert.deepEqual(r.screen, { id: "home", name: "Home", width: 400, height: 300, x: 10, y: -5, updated_at: 50 });
  assert.equal(r.event.kind, "screen.set");
  assert.equal(r.event.project, "tvdash");
  assert.deepEqual(r.event.payload, { canvas: "main", id: "home", name: "Home", width: 400, height: 300, bytes: 9, created: true });
  assert.ok(!JSON.stringify(r.event).includes("<p>"));
  const noPos = setScreen(sql, "tvdash", scr({ name: "Two" }));
  assert.deepEqual([noPos.screen.x, noPos.screen.y], [null, null]);
});

test("set_screen is an upsert: created false, keeps order, replaces fields, touches the canvas", () => {
  const sql = withCanvas();
  setScreen(sql, "tvdash", scr({ name: "A" }), 20);
  setScreen(sql, "tvdash", scr({ name: "B" }), 21);
  setScreen(sql, "tvdash", scr({ name: "C" }), 22);
  const r = setScreen(sql, "tvdash", scr({ name: "A2", id: "a", width: 500, html: "<b>new</b>" }), 60);
  assert.equal(r.created, false);
  assert.equal((r.event.payload as any).created, false);
  const read = readCanvas(sql, "tvdash", "main", true);
  assert.deepEqual(read.screens.map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual({ ...read.screens[0] }, { id: "a", name: "A2", width: 500, height: 300, x: null, y: null, updated_at: 60, bytes: 10, layout: { x: 0, y: 0 }, html: "<b>new</b>" });
  assert.equal(read.canvas.updated_at, 60);
  assert.equal(read.canvas.screens, 3);
});

test("set_screen validation", () => {
  const sql = withCanvas();
  const bad = (o: Partial<ScreenInput>, re: RegExp) => assert.throws(() => setScreen(sql, "tvdash", scr(o)), re);
  bad({ name: "" }, /invalid name/);
  bad({ name: "n".repeat(101) }, /invalid name/);
  bad({ id: "Bad" }, /invalid screen id "Bad"/);
  bad({ name: "!!!" }, /invalid screen id ""/);
  for (const w of [99, 8001, 100.5, "400" as any, NaN, undefined as any]) {
    bad({ width: w }, /invalid width: use an integer from 100 to 8000/);
    bad({ height: w }, /invalid height: use an integer from 100 to 8000/);
  }
  bad({ html: 5 as any }, /invalid html/);
  bad({ x: 1.5 }, /invalid x/);
  bad({ y: "1" as any }, /invalid y/);
  bad({ canvas: "ghost" }, /unknown canvas "ghost"/);
  assert.equal(setScreen(sql, "tvdash", scr({ width: 100, height: 8000, html: "" })).created, true);
  assert.equal(kinds(sql).filter((k) => k === "screen.set").length, 1);
});

test("html limit is bytes, not characters", () => {
  const sql = withCanvas();
  const ok = "a".repeat(SCREEN_HTML_LIMIT);
  assert.equal(setScreen(sql, "tvdash", scr({ html: ok })).event.kind, "screen.set");
  assert.throws(() => setScreen(sql, "tvdash", scr({ html: ok + "a" })), { message: "screen too large: 200001 bytes, limit 200000" });
  const multi = "é".repeat(SCREEN_HTML_LIMIT / 2); // 100000 chars, 200000 bytes
  assert.equal(setScreen(sql, "tvdash", scr({ name: "m", html: multi })).created, true);
  assert.throws(() => setScreen(sql, "tvdash", scr({ name: "m2", html: multi + "é" })), { message: "screen too large: 200002 bytes, limit 200000" });
  const emoji = "😀".repeat(50_001); // 50001 chars, 200004 bytes
  assert.throws(() => setScreen(sql, "tvdash", scr({ name: "e", html: emoji })), /screen too large: 200004 bytes/);
});

test("screen limit: 50 per canvas; replacing an existing one at the limit is fine", () => {
  const sql = withCanvas();
  for (let i = 0; i < SCREENS_PER_CANVAS; i++) setScreen(sql, "tvdash", scr({ name: `s${i}` }));
  assert.throws(() => setScreen(sql, "tvdash", scr({ name: "extra" })), { message: "too many screens: limit 50" });
  assert.equal(setScreen(sql, "tvdash", scr({ name: "s0", html: "<i></i>" })).created, false);
  removeScreen(sql, "tvdash", "main", "s1");
  assert.equal(setScreen(sql, "tvdash", scr({ name: "extra" })).created, true);
});

test("read_canvas: bytes per screen is the UTF-8 size, with or without html", () => {
  const sql = withCanvas();
  setScreen(sql, "tvdash", scr({ name: "ascii", html: "<p>hi</p>" }));
  setScreen(sql, "tvdash", scr({ name: "multi", html: "é€😀" }));
  setScreen(sql, "tvdash", scr({ name: "empty", html: "" }));
  const lean = readCanvas(sql, "tvdash", "main");
  assert.deepEqual(lean.screens.map((s) => s.bytes), [9, 9, 0]);
  assert.ok(lean.screens.every((s) => !("html" in s)));
  const full = readCanvas(sql, "tvdash", "main", true);
  assert.deepEqual(full.screens.map((s) => s.bytes), [9, 9, 0]);
  assert.deepEqual(full.screens.map((s) => s.html), ["<p>hi</p>", "é€😀", ""]);
});

test("read_canvas: html only on request; unknown canvas", () => {
  const sql = withCanvas();
  setScreen(sql, "tvdash", scr());
  const lean = readCanvas(sql, "tvdash", "main");
  assert.ok(!("html" in lean.screens[0]));
  assert.equal(lean.canvas.id, "main");
  assert.equal(readCanvas(sql, "tvdash", "main", true).screens[0].html, "<p>hi</p>");
  assert.throws(() => readCanvas(sql, "tvdash", "ghost"), { message: 'unknown canvas "ghost"' });
  assert.throws(() => readCanvas(sql, "tvdash", "../x"), /invalid canvas id/);
});

test("remove_screen: event once, idempotent after", () => {
  const sql = withCanvas();
  setScreen(sql, "tvdash", scr());
  const r = removeScreen(sql, "tvdash", "main", "home", 70);
  assert.deepEqual(r.screen, { canvas: "main", id: "home", name: "Home" });
  assert.equal(r.event?.kind, "screen.removed");
  assert.deepEqual(r.event?.payload, { canvas: "main", id: "home", name: "Home" });
  const n = eventsAfter(sql).length;
  const again = removeScreen(sql, "tvdash", "main", "home");
  assert.equal(again.event, null);
  assert.deepEqual(again.screen, { canvas: "main", id: "home" });
  assert.equal(eventsAfter(sql).length, n);
  assert.throws(() => removeScreen(sql, "tvdash", "ghost", "home"), { message: 'unknown canvas "ghost"' });
  assert.equal(readCanvas(sql, "tvdash", "main").canvas.screens, 0);
});

test("remove_canvas archives, hides from list, keeps rows; idempotent", () => {
  const sql = withCanvas();
  setScreen(sql, "tvdash", scr());
  const r = removeCanvas(sql, "tvdash", "main", 80);
  assert.equal(r.event?.kind, "canvas.removed");
  assert.deepEqual(r.event?.payload, { canvas: "main", name: "Main" });
  assert.equal(r.canvas.archived_at, 80);
  assert.deepEqual(listCanvases(sql, "tvdash").canvases, []);
  assert.throws(() => readCanvas(sql, "tvdash", "main"), { message: 'unknown canvas "main"' });
  assert.throws(() => setScreen(sql, "tvdash", scr()), { message: 'unknown canvas "main"' });
  assert.equal(sql.all("SELECT 1 FROM screens").length, 1);
  const n = eventsAfter(sql).length;
  assert.equal(removeCanvas(sql, "tvdash", "main").event, null);
  assert.equal(eventsAfter(sql).length, n);
  assert.throws(() => removeCanvas(sql, "tvdash", "ghost"), { message: 'unknown canvas "ghost"' });
});

test("list_canvases: counts, newest updated first, scoped to the project", () => {
  const sql = fresh();
  openProject(sql, { name: "other", manifest: { tree: [], files: {} } }, 2);
  createCanvas(sql, "tvdash", { name: "A" }, 10);
  createCanvas(sql, "tvdash", { name: "B" }, 11);
  createCanvas(sql, "other", { name: "Z" }, 12);
  setScreen(sql, "tvdash", scr({ canvas: "a" }), 50);
  assert.deepEqual(listCanvases(sql, "tvdash").canvases, [
    { id: "a", name: "A", screens: 1, updated_at: 50 },
    { id: "b", name: "B", screens: 0, updated_at: 11 },
  ]);
  assert.deepEqual(listCanvases(sql, "other").canvases.map((c) => c.id), ["z"]);
});

test("atomicity: a failing event insert leaves no row behind", () => {
  const sql = withCanvas();
  sql.script(`CREATE TRIGGER fail_ev BEFORE INSERT ON events WHEN NEW.kind IN ('screen.set','canvas.created') BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
  assert.throws(() => setScreen(sql, "tvdash", scr()), /boom/);
  assert.equal(sql.all("SELECT 1 FROM screens").length, 0);
  assert.equal(readCanvas(sql, "tvdash", "main").canvas.updated_at, 10);
  assert.throws(() => createCanvas(sql, "tvdash", { name: "New" }), /boom/);
  assert.equal(listCanvases(sql, "tvdash").canvases.length, 1);
  sql.script("DROP TRIGGER fail_ev");
  setScreen(sql, "tvdash", scr());
  sql.script(`CREATE TRIGGER fail_ev BEFORE INSERT ON events WHEN NEW.kind IN ('screen.removed','canvas.removed') BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
  assert.throws(() => removeScreen(sql, "tvdash", "main", "home"), /boom/);
  assert.equal(readCanvas(sql, "tvdash", "main").screens.length, 1);
  assert.throws(() => removeCanvas(sql, "tvdash", "main"), /boom/);
  assert.equal(listCanvases(sql, "tvdash").canvases.length, 1);
});

test("canvas events interleave with other events in seq order", () => {
  const sql = withCanvas();
  appendEvent(sql, { kind: "ping" });
  setScreen(sql, "tvdash", scr());
  assert.deepEqual(kinds(sql), ["project.opened", "canvas.created", "ping", "screen.set"]);
});

test("tool descriptions mention each limit and the html guidance", () => {
  const d = CANVAS_TEXT.set_screen;
  for (const s of ["200000", "50", "100", "8000", "no scripts", "https URLs or data: URIs", "nothing else is loaded", "inline CSS", "width x height"]) assert.ok(d.includes(s), s);
  assert.ok(CANVAS_TEXT.create_canvas.includes("20"));
  for (const k of ["create_canvas", "list_canvases", "read_canvas", "set_screen", "remove_screen", "remove_canvas"] as const) assert.ok(CANVAS_TEXT[k].length > 20);
});

const fields = (o: Partial<ScreenInput> = {}) => {
  const { canvas: _c, ...rest } = scr(o);
  return rest;
};

test("screenWarnings: script (any case), large, empty; clean html has none", () => {
  assert.deepEqual(screenWarnings("<p>ok</p>"), []);
  assert.deepEqual(screenWarnings("<SCRIPT>x</SCRIPT>"), ["html contains <script>: scripts never run in the sandbox"]);
  assert.deepEqual(screenWarnings("   \n"), ["html has no content"]);
  assert.deepEqual(screenWarnings(""), ["html has no content"]);
  assert.deepEqual(screenWarnings("a".repeat(150_000)), []);
  assert.deepEqual(screenWarnings("a".repeat(150_001)), ["html is large: 150001 bytes (limit 200000)"]);
  assert.equal(screenWarnings("<script>" + "a".repeat(150_000)).length, 2);
});

test("set_screen answers bytes and warnings", () => {
  const sql = withCanvas();
  const r = setScreen(sql, "tvdash", scr({ html: "<script>1</script>" }));
  assert.equal(r.bytes, 18);
  assert.equal(r.warnings.length, 1);
  assert.deepEqual(setScreen(sql, "tvdash", scr({ name: "ok" })).warnings, []);
});

test("set_screens: writes all, answers in order with bytes, created, warnings; one event each in order", () => {
  const sql = withCanvas();
  setScreen(sql, "tvdash", scr({ name: "A" }), 11);
  const r = setScreens(sql, "tvdash", "main", [fields({ name: "A", html: "<p>new</p>" }), fields({ name: "B", html: "", x: 5, y: 6 })], 30);
  assert.deepEqual(r.screens.map((s) => [s.id, s.created, s.bytes, s.warnings.length]), [["a", false, 10, 0], ["b", true, 0, 1]]);
  assert.deepEqual({ ...r.screens[1] }, { id: "b", name: "B", width: 400, height: 300, x: 5, y: 6, updated_at: 30, bytes: 0, created: true, warnings: ["html has no content"] });
  assert.equal(r.events.length, 2);
  assert.deepEqual(r.events.map((e) => (e.payload as { id: string }).id), ["a", "b"]);
  assert.ok(r.events[0].seq < r.events[1].seq);
  assert.deepEqual(kinds(sql).slice(-2), ["screen.set", "screen.set"]);
});

test("set_screens is atomic: a bad screen in the middle writes nothing and appends no events", () => {
  const sql = withCanvas();
  const before = eventsAfter(sql).length;
  assert.throws(
    () => setScreens(sql, "tvdash", "main", [fields({ name: "A" }), fields({ name: "Bad", width: 5 }), fields({ name: "C" })]),
    { message: "screen 1 (Bad): invalid width: use an integer from 100 to 8000" },
  );
  assert.equal(readCanvas(sql, "tvdash", "main").screens.length, 0);
  assert.equal(eventsAfter(sql).length, before);
});

test("set_screens is atomic for write-time failures too (screen limit) and prefixes them", () => {
  const sql = withCanvas();
  for (let i = 0; i < SCREENS_PER_CANVAS - 1; i++) setScreen(sql, "tvdash", scr({ name: `s${i}` }));
  const before = eventsAfter(sql).length;
  assert.throws(() => setScreens(sql, "tvdash", "main", [fields({ name: "x1" }), fields({ name: "x2" })]), { message: "screen 1 (x2): too many screens: limit 50" });
  assert.equal(readCanvas(sql, "tvdash", "main").screens.length, SCREENS_PER_CANVAS - 1);
  assert.equal(eventsAfter(sql).length, before);
});

test("set_screens: 1 to 20 screens, project and canvas checked", () => {
  const sql = withCanvas();
  assert.throws(() => setScreens(sql, "tvdash", "main", []), /use 1 to 20 screens/);
  const many = Array.from({ length: SCREENS_PER_CALL + 1 }, (_, i) => fields({ name: `n${i}` }));
  assert.throws(() => setScreens(sql, "tvdash", "main", many), /use 1 to 20 screens/);
  assert.equal(setScreens(sql, "tvdash", "main", many.slice(0, 20)).screens.length, 20);
  assert.throws(() => setScreens(sql, "tvdash", "nope", [fields()]), { message: 'unknown canvas "nope"' });
  assert.throws(() => setScreens(sql, "ghost", "main", [fields()]), { message: 'unknown project "ghost"' });
});

test("read_canvas layout equals web/layout.ts on the same inputs; x and y stay as stored", () => {
  const sql = withCanvas();
  setScreen(sql, "tvdash", scr({ name: "a", width: 100, height: 100 }));
  setScreen(sql, "tvdash", scr({ name: "b", width: 200, height: 300, x: 7, y: -9 }));
  setScreen(sql, "tvdash", scr({ name: "c", width: 150, height: 120, x: 3 }));
  setScreen(sql, "tvdash", scr({ name: "d", width: 100, height: 100 }));
  setScreen(sql, "tvdash", scr({ name: "e", width: 100, height: 100 }));
  setScreen(sql, "tvdash", scr({ name: "f", width: 100, height: 100 }));
  const { screens } = readCanvas(sql, "tvdash", "main");
  const boxes = webLayout(screens);
  assert.deepEqual(screens.map((s) => s.layout), boxes.map((b) => ({ x: b.x, y: b.y })));
  assert.deepEqual(screens.map((s) => s.layout), [{ x: 0, y: 0 }, { x: 7, y: -9 }, { x: 260, y: 0 }, { x: 570, y: 0 }, { x: 0, y: 280 }, { x: 260, y: 280 }]);
  assert.deepEqual(screens.map((s) => [s.x, s.y]), [[null, null], [7, -9], [3, null], [null, null], [null, null], [null, null]]);
});

test("tool texts: set_screens guidance, id truncation, remove_screen keeps the log, bytes", () => {
  const t = CANVAS_TEXT.set_screens;
  for (const s of ["20", "ALL OR NOTHING", "screen <index> (<name>)", "truncated at 40", "explicitly"]) assert.ok(t.includes(s), s);
  const d = CANVAS_TEXT.set_screen;
  for (const s of ["truncated at 40", "same name replaces", "different name makes a second", "explicitly", "bytes", "warnings", "set_screens"]) assert.ok(d.includes(s), s);
  assert.ok(CANVAS_TEXT.remove_screen.includes("log"));
  assert.ok(CANVAS_TEXT.read_canvas.includes("layout") && CANVAS_TEXT.read_canvas.includes("bytes"));
});
