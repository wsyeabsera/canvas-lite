import { test } from "node:test";
import assert from "node:assert/strict";
import { createScene, listScenes, patchScene, readScene, setFilms, setScene, validateStoredScene } from "../src/scene-store.ts";
import { openProject, removeProject } from "../src/projects.ts";
import { appendEvent, eventsAfter, MIGRATIONS, migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const scene = () => ({
  name: "Town",
  objects: [
    { id: "house", kind: "box", pos: [0, 1, 0], size: [2, 2, 2], material: { color: "#aa5533" } },
    { id: "street", kind: "group", children: [{ id: "lamp", kind: "cylinder", pos: [5, 1, 0], size: [0.1, 2] }] },
  ],
  lights: [{ id: "sun", kind: "sun", color: "#ffffff", intensity: 1, pos: [10, 20, 10] }],
  sky: { top: "#2c4a7a", bottom: "#f0b27a" },
  camera: { pos: [0, 5, 20], look: "house", fov: 50 },
});
const shot = (look: unknown) => ({ id: "s1", name: "One", from: { pos: [0, 5, 20], look }, to: { pos: [5, 5, 15], look }, duration_ms: 4000, focus: "lamp" });
const films = (look: unknown = "house") => [{ id: "tour", name: "Tour", shots: [shot(look)] }];

const setup = () => {
  const sql = nodeSql();
  migrate(sql);
  openProject(sql, { name: "tvdash", manifest: { tree: [], files: {} } }, 1);
  return sql;
};
const made = () => {
  const sql = setup();
  createScene(sql, "tvdash", { name: "Town" }, 2);
  setScene(sql, "tvdash", "town", scene(), 3);
  return sql;
};

test("migration 7 on a populated v6 database keeps all data and adds the scenes table", () => {
  const sql = nodeSql();
  sql.script("CREATE TABLE _migrations (version INTEGER PRIMARY KEY)");
  for (let v = 0; v < 6; v++) {
    sql.script(MIGRATIONS[v]);
    sql.run("INSERT INTO _migrations (version) VALUES (?)", v + 1);
  }
  sql.run("INSERT INTO projects (id, name, kind, repo, manifest, opened_at, archived_at) VALUES ('tvdash', 'TV', 'web', NULL, NULL, 5, NULL)");
  sql.run("INSERT INTO canvases (project, id, name, created_at, updated_at) VALUES ('tvdash', 'main', 'Main', 1, 2)");
  sql.run("INSERT INTO screens (project, canvas, id, name, width, height, html, updated_at) VALUES ('tvdash', 'main', 'home', 'Home', 400, 300, '<p>x</p>', 3)");
  const ev = appendEvent(sql, { project: "tvdash", kind: "x", payload: { n: 1 } }, 4);
  migrate(sql);
  assert.equal(sql.all("SELECT max(version) AS v FROM _migrations")[0].v, 8);
  assert.equal(sql.all("SELECT 1 FROM projects").length, 1);
  assert.equal(sql.all("SELECT 1 FROM screens").length, 1);
  assert.deepEqual(eventsAfter(sql).map((e) => [e.seq, e.payload]), [[ev.seq, { n: 1 }]]);
  assert.throws(() => sql.run("DELETE FROM events WHERE seq = ?", ev.seq), /append-only/);
  assert.deepEqual(
    sql.all<{ name: string }>("SELECT name FROM pragma_table_info('scenes') ORDER BY cid").map((c) => c.name),
    ["project", "id", "name", "data", "films", "updated_at", "removed", "page"],
  );
  assert.deepEqual(sql.all("SELECT count(*) AS n FROM scenes")[0].n, 0);
});

test("createScene then readScene round-trips", () => {
  const sql = setup();
  const { scene: s, event } = createScene(sql, "tvdash", { name: "Small town" }, 2);
  assert.deepEqual(s, { id: "small-town", name: "Small town", objects: 0, drawables: 0, films: 0, updated_at: 2 });
  assert.equal(event.kind, "scene.set");
  const r = readScene(sql, "tvdash", "small-town");
  assert.equal(r.scene.name, "Small town");
  assert.deepEqual([r.scene.objects, r.films, r.updated_at], [[], [], 2]);
  setScene(sql, "tvdash", "small-town", scene(), 5);
  assert.deepEqual(readScene(sql, "tvdash", "small-town").scene, scene());
  assert.throws(() => createScene(sql, "tvdash", { name: "Small town" }), /already exists/);
});

test("setScene stores the body in the table and the event carries no body", () => {
  const sql = made();
  const ev = eventsAfter(sql).filter((e) => e.kind === "scene.set");
  assert.equal(ev.length, 2);
  assert.deepEqual(Object.keys(ev[1].payload as object).sort(), ["bytes", "name", "scene"]);
  assert.equal((ev[1].payload as any).bytes, new TextEncoder().encode(JSON.stringify(scene())).length);
  assert.ok(!JSON.stringify(ev[1].payload).includes("house"));
  assert.ok(String(sql.all<{ data: string }>("SELECT data FROM scenes")[0].data).includes("house"));
  setFilms(sql, "tvdash", "town", films(), 6);
  const f = eventsAfter(sql).at(-1)!;
  assert.deepEqual([f.kind, f.payload], ["films.set", { scene: "town", count: 1 }]);
});

test("invalid input stores nothing and names the path; unknown project and scene have clear errors", () => {
  const sql = made();
  const before = eventsAfter(sql).length;
  assert.throws(() => setScene(sql, "tvdash", "town", { ...scene(), camera: { pos: [0, NaN, 0], look: "house", fov: 50 } }), /camera\.pos/);
  assert.equal(eventsAfter(sql).length, before);
  assert.throws(() => readScene(sql, "tvdash", "nope"), /unknown scene "nope"/);
  assert.throws(() => readScene(sql, "ghost", "town"), /unknown project "ghost"/);
  assert.throws(() => setScene(sql, "tvdash", "nope", scene()), /unknown scene "nope"/);
  assert.throws(() => readScene(sql, "tvdash", "Bad Id"), /invalid scene id/);
});

test("patchScene edits nested objects by id, adds new ones and re-checks the whole scene", () => {
  const sql = made();
  patchScene(sql, "tvdash", "town", [
    { op: "set", id: "lamp", object: { id: "lamp", kind: "sphere", pos: [5, 2, 0], size: [0.5] } },
    { op: "set", id: "tree", object: { id: "tree", kind: "cone", pos: [3, 1, 3], size: [1, 2] } },
  ], 7);
  const r = readScene(sql, "tvdash", "town");
  assert.equal((r.scene.objects[1].children![0] as any).kind, "sphere");
  assert.deepEqual(r.scene.objects.map((o) => o.id), ["house", "street", "tree"]);
  assert.throws(() => patchScene(sql, "tvdash", "town", [{ op: "set", id: "tree", object: { id: "house", kind: "box" } }]), /duplicate id "house"/);
  assert.equal(readScene(sql, "tvdash", "town").scene.objects.length, 3);
});

test("patchScene removes an object a shot points at, succeeds, and readScene lists the shot under missing", () => {
  const sql = made();
  setFilms(sql, "tvdash", "town", films(), 6);
  assert.deepEqual(readScene(sql, "tvdash", "town").films[0].missing, []);
  patchScene(sql, "tvdash", "town", [{ op: "remove", id: "lamp" }], 7);
  const r = readScene(sql, "tvdash", "town");
  assert.deepEqual(r.films[0].missing, [0]);
  assert.equal(r.films[0].duration_ms, 4000);
  assert.deepEqual(r.scene.objects.map((o) => o.id), ["house", "street"]);
  const v = validateStoredScene(sql, "tvdash", "town");
  assert.equal(v.ok, false);
  assert.deepEqual(v.issues.filter((i) => i.severity === "error").map((i) => [i.kind, i.object]), [["focus_missing", "lamp"]]);
});

test("patchScene with an unknown object id names it", () => {
  const sql = made();
  assert.throws(() => patchScene(sql, "tvdash", "town", [{ op: "remove", id: "ghost" }]), /unknown object "ghost"/);
});

test("setFilms rejects a shot whose focus object does not exist", () => {
  const sql = made();
  const bad = [{ id: "tour", name: "Tour", shots: [{ ...shot("house"), focus: "ghost" }] }];
  assert.throws(() => setFilms(sql, "tvdash", "town", bad), /film "tour" shot 0.*ghost/);
  assert.deepEqual(readScene(sql, "tvdash", "town").films, []);
  assert.throws(() => setFilms(sql, "tvdash", "nope", []), /unknown scene "nope"/);
});

test("listScenes counts objects and films", () => {
  const sql = made();
  setFilms(sql, "tvdash", "town", films(), 6);
  createScene(sql, "tvdash", { name: "Empty" }, 9);
  assert.deepEqual(listScenes(sql, "tvdash"), [
    { id: "empty", name: "Empty", objects: 0, drawables: 0, films: 0, updated_at: 9 },
    { id: "town", name: "Town", objects: 2, drawables: 3, films: 1, updated_at: 6 },
  ]);
  assert.throws(() => listScenes(sql, "ghost"), /unknown project "ghost"/);
});

const rows = (sql: ReturnType<typeof setup>) => sql.all<{ data: string; removed: number }>("SELECT data, removed FROM scenes");

test("an over-limit repeater (even of an empty group) is rejected through setScene and patchScene, storing nothing", () => {
  const sql = made();
  const before = [eventsAfter(sql).length, JSON.stringify(rows(sql))];
  const empty = { id: "g", kind: "group", children: [] };
  const bomb = { id: "r", kind: "repeat", repeat: { mode: "grid", count: 1_000_000, of: empty } };
  const nested = { id: "o", kind: "repeat", repeat: { mode: "grid", count: 1_000_000, of: { ...bomb, id: "r" } } };
  const house = { id: "hs", kind: "repeat", repeat: { mode: "grid", count: 2000, of: { id: "h", kind: "group", children: [{ id: "w", kind: "box" }] } } };
  for (const o of [bomb, nested, house]) {
    assert.throws(() => setScene(sql, "tvdash", "town", { ...scene(), objects: [...scene().objects, o] }), /expands to \d+ objects \(limit 2000\)/);
    assert.throws(() => patchScene(sql, "tvdash", "town", [{ op: "set", id: o.id, object: o as any }]), /expands to \d+ objects \(limit 2000\)/);
  }
  assert.throws(() => patchScene(sql, "tvdash", "town", [{ op: "set", id: "hs", object: house as any }]), /repeater "hs" expands to 4000 objects/);
  assert.deepEqual([eventsAfter(sql).length, JSON.stringify(rows(sql))], before);
});

test("patchScene edits an object inside a repeater template instead of appending a duplicate", () => {
  const sql = made();
  const rep = { id: "trees", kind: "repeat", repeat: { mode: "ring", count: 3, radius: 9, of: { id: "tree", kind: "cone", size: [1, 2] } } };
  patchScene(sql, "tvdash", "town", [{ op: "set", id: "trees", object: rep as any }], 4);
  patchScene(sql, "tvdash", "town", [{ op: "set", id: "tree", object: { id: "tree", kind: "sphere", size: [0.5] } }], 5);
  const r = readScene(sql, "tvdash", "town");
  assert.deepEqual(r.scene.objects.map((o) => o.id), ["house", "street", "trees"]);
  assert.equal(r.scene.objects[2].repeat!.of.kind, "sphere");
  const g = { id: "trees", kind: "repeat", repeat: { mode: "ring", count: 2, of: { id: "pair", kind: "group", children: [{ id: "leaf", kind: "box" }] } } };
  patchScene(sql, "tvdash", "town", [{ op: "set", id: "trees", object: g as any }, { op: "remove", id: "leaf" }], 6);
  assert.deepEqual(readScene(sql, "tvdash", "town").scene.objects[2].repeat!.of.children, []);
  assert.throws(() => patchScene(sql, "tvdash", "town", [{ op: "remove", id: "pair" }]), /repeater template "pair".*remove the repeater "trees"/);
});

test("renaming an object a shot points at (set with a different object.id) lists the shot under missing", () => {
  const sql = made();
  setFilms(sql, "tvdash", "town", films(), 6);
  patchScene(sql, "tvdash", "town", [{ op: "set", id: "lamp", object: { id: "lantern", kind: "sphere", size: [0.3] } }], 7);
  const r = readScene(sql, "tvdash", "town");
  assert.deepEqual(r.scene.objects[1].children!.map((o) => o.id), ["lantern"]);
  assert.deepEqual(r.films[0].missing, [0]);
});

test("an archived project is rejected like an unknown one", () => {
  const sql = made();
  removeProject(sql, "tvdash", 10);
  for (const f of [
    () => createScene(sql, "tvdash", { name: "New" }), () => readScene(sql, "tvdash", "town"), () => listScenes(sql, "tvdash"),
    () => setScene(sql, "tvdash", "town", scene()), () => patchScene(sql, "tvdash", "town", [{ op: "remove", id: "lamp" }]),
    () => setFilms(sql, "tvdash", "town", []), () => validateStoredScene(sql, "tvdash", "town"),
  ]) assert.throws(f, /unknown project "tvdash"/);
});

test("createScene revives a removed scene row in place instead of deleting it", () => {
  const sql = made();
  setFilms(sql, "tvdash", "town", films(), 6);
  sql.run("UPDATE scenes SET removed = 1 WHERE project = 'tvdash' AND id = 'town'");
  assert.throws(() => readScene(sql, "tvdash", "town"), /unknown scene "town"/);
  sql.script("CREATE TRIGGER scenes_no_delete BEFORE DELETE ON scenes BEGIN SELECT RAISE(ABORT, 'scene rows are never deleted'); END");
  const { scene: s } = createScene(sql, "tvdash", { name: "Town" }, 8);
  assert.deepEqual(s, { id: "town", name: "Town", objects: 0, drawables: 0, films: 0, updated_at: 8 });
  const r = readScene(sql, "tvdash", "town");
  assert.deepEqual([r.scene.objects, r.films, r.updated_at], [[], [], 8]);
  assert.deepEqual(rows(sql).map((x) => x.removed), [0]);
});
