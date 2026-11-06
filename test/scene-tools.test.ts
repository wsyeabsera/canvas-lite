// The scene tools end to end without the Hub (like proto-tools.test.ts): the same store functions the Hub calls, on an in-memory db.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createScene, listScenes, patchScene, readScene, SCENE_TEXT, setFilms, setScene, validateStoredScene } from "../src/scene-store.ts";
import { openProject } from "../src/projects.ts";
import { eventsAfter, migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const sql = nodeSql();
migrate(sql);
openProject(sql, { name: "tvdash", manifest: { tree: [], files: {} } }, 1);

const scene = {
  name: "Small town",
  objects: [{ id: "hall", kind: "box", pos: [0, 2, 0], size: [10, 4, 10], material: { color: "#aa8866" } }, { id: "tree", kind: "cone", pos: [20, 1, 0], size: [1, 2] }],
  lights: [{ id: "sun", kind: "sun", color: "#ffffff", intensity: 1, pos: [10, 20, 10] }, { id: "air", kind: "ambient", color: "#334455", intensity: 0.4 }],
  sky: { top: "#2c4a7a", bottom: "#f0b27a" },
  camera: { pos: [0, 10, 40], look: "hall", fov: 50 },
};
const film = (pos: number[], ms = 4000) => [{ id: "tour", name: "Tour", shots: [{ id: "a", name: "Hall", from: { pos, look: "hall" }, to: { pos: [10, 8, 30], look: "hall" }, duration_ms: ms, caption: "The town hall", focus: "hall" }] }];

test("create, set, patch, set_films, read and list end to end", () => {
  assert.equal(createScene(sql, "tvdash", { name: "Small town" }, 2).scene.id, "small-town");
  setScene(sql, "tvdash", "small-town", scene, 3);
  patchScene(sql, "tvdash", "small-town", [{ op: "set", id: "tree", object: { id: "tree", kind: "cone", pos: [22, 1, 0], size: [1, 2] } }], 4);
  assert.deepEqual(setFilms(sql, "tvdash", "small-town", film([0, 8, 30]), 5).result, { scene: "small-town", count: 1 });
  const r = readScene(sql, "tvdash", "small-town");
  assert.deepEqual((r.scene.objects[1] as any).pos, [22, 1, 0]);
  assert.deepEqual([r.films[0].duration_ms, r.films[0].missing, r.updated_at], [4000, [], 5]);
  assert.deepEqual(listScenes(sql, "tvdash"), [{ id: "small-town", name: "Small town", objects: 2, drawables: 2, films: 1, updated_at: 5 }]);
  assert.deepEqual(validateStoredScene(sql, "tvdash", "small-town"), { ok: true, issues: [] });
  assert.deepEqual(eventsAfter(sql).filter((e) => e.kind.startsWith("scene") || e.kind === "films.set").map((e) => e.kind), ["scene.set", "scene.set", "scene.set", "films.set"]);
});

test("validate_scene reports a camera inside a box with a fix, and ok turns true once fixed", () => {
  setFilms(sql, "tvdash", "small-town", film([0, 2, 0]), 6);
  const v = validateStoredScene(sql, "tvdash", "small-town");
  assert.equal(v.ok, false);
  const i = v.issues.find((x) => x.kind === "camera_inside_solid")!;
  assert.deepEqual([i.severity, i.object, i.film, i.shot], ["error", "hall", "tour", 0]);
  assert.match(i.fix, /outside "hall"/);
  setFilms(sql, "tvdash", "small-town", film([0, 8, 30]), 7);
  assert.equal(validateStoredScene(sql, "tvdash", "small-town").ok, true);
});

test("an empty scene is valid and validate says so as info; missing lights warn", () => {
  createScene(sql, "tvdash", { name: "Void" }, 8);
  const v = validateStoredScene(sql, "tvdash", "void");
  assert.equal(v.ok, true);
  assert.deepEqual(v.issues.map((x) => [x.severity, x.kind]), [["info", "empty_scene"], ["warning", "no_lights"]]);
});

test("errors name the unknown project, scene and bad value", () => {
  assert.throws(() => listScenes(sql, "ghost"), /unknown project "ghost"/);
  assert.throws(() => validateStoredScene(sql, "tvdash", "nope"), /unknown scene "nope"/);
  assert.throws(() => setScene(sql, "tvdash", "void", { ...scene, lights: [{ id: "x", kind: "sun", color: "#fff", intensity: 1 }] }), /lights\[0\]\.color/);
});

test("tool descriptions tell Claude the workflow", () => {
  assert.match(SCENE_TEXT.set_scene, /data, never code/);
  assert.match(SCENE_TEXT.set_scene, /lights/);
  assert.match(SCENE_TEXT.set_films, /2 TO 4 FILMS/);
  assert.match(SCENE_TEXT.set_films, /plain words/);
  assert.match(SCENE_TEXT.validate_scene, /fix every issue.*before you show anything/);
});
