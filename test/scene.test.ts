import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScene, expandObjects, objectIds, SCENE_NESTING_MAX, type SceneObject } from "../src/scene.ts";

const base = (objects: unknown[] = []) => ({
  name: "Town",
  objects,
  lights: [{ id: "sun", kind: "sun", color: "#ffffff", intensity: 1 }],
  sky: { top: "#88aaff", bottom: "#ffeecc" },
  camera: { pos: [0, 5, 10], look: [0, 0, 0], fov: 50 },
});
const box = (id: string, extra: object = {}) => ({ id, kind: "box", ...extra });
const flat = (os: SceneObject[]): SceneObject[] => os.flatMap((o) => (o.children ? flat(o.children) : [o]));

test("checkScene accepts a minimal scene (no objects)", () => {
  const s = checkScene(base());
  assert.deepEqual(s.objects, []);
  assert.equal(s.camera.fov, 50);
});

test("checkScene names the path of a bad colour", () => {
  assert.throws(() => checkScene(base([box("a", { material: { color: "red" } })])), /objects\[0\]\.material\.color/);
});

test("checkScene rejects NaN, Infinity and 1e12 positions", () => {
  for (const bad of [NaN, Infinity, -Infinity, 1e12])
    assert.throws(() => checkScene(base([box("a", { pos: [0, bad, 0] })])), /objects\[0\]\.pos\[1\]/);
  assert.throws(() => checkScene({ ...base(), lights: [{ id: "l", kind: "point", color: "#ffffff", intensity: NaN }] }), /lights\[0\]\.intensity/);
});

test("checkScene rejects duplicate ids across nested groups", () => {
  const g = (id: string, kids: unknown[]) => ({ id, kind: "group", children: kids });
  assert.throws(() => checkScene(base([g("g1", [box("dup")]), g("g2", [g("g3", [box("dup")])])])), /duplicate id "dup"/);
});

test("checkScene rejects nesting deeper than 6", () => {
  const nest = (n: number): unknown => (n === 0 ? box("leaf") : { id: `g${n}`, kind: "group", children: [nest(n - 1)] });
  assert.doesNotThrow(() => checkScene(base([nest(SCENE_NESTING_MAX - 1)])));
  assert.throws(() => checkScene(base([nest(SCENE_NESTING_MAX)])), /nested deeper than 6/);
});

test("checkScene rejects over 200000 bytes", () => {
  const objs = Array.from({ length: 1900 }, (_, i) => box(`b${i}`, { name: "x".repeat(80) }));
  assert.throws(() => checkScene(base(objs)), /bytes, limit 200000/);
});

test("checkScene rejects unknown camera look id and kind mismatches", () => {
  assert.throws(() => checkScene({ ...base(), camera: { pos: [0, 0, 0], look: "nope", fov: 50 } }), /camera\.look.*"nope"/);
  assert.throws(() => checkScene(base([box("a", { children: [] })])), /objects\[0\]\.children/);
});

test("expandObjects grid of 3 x 3 gives 9 copies with ids tower#0..tower#8", () => {
  const s = checkScene(base([{ id: "rows", kind: "repeat", repeat: { mode: "grid", count: 9, spacing: 3, of: box("tower") } }]));
  const out = expandObjects(s.objects);
  assert.deepEqual(out.map((o) => o.id), Array.from({ length: 9 }, (_, i) => `tower#${i}`));
  assert.deepEqual(out[4].pos, [3, 0, 3]);
  assert.ok(objectIds(s).has("tower") && objectIds(s).has("rows"));
});

test("expandObjects ring places copies on the radius", () => {
  const s = checkScene(base([{ id: "r", kind: "repeat", pos: [1, 0, 0], repeat: { mode: "ring", count: 4, radius: 2, of: box("p") } }]));
  const out = expandObjects(s.objects);
  assert.equal(out.length, 4);
  assert.ok(Math.abs(out[0].pos![0] - 3) < 1e-9);
});

test("expandObjects scatter is deterministic for a seed", () => {
  const mk = (seed: number) => checkScene(base([{ id: "s", kind: "repeat", repeat: { mode: "scatter", count: 20, radius: 10, seed, of: box("t") } }]));
  const a = expandObjects(mk(7).objects);
  assert.deepEqual(a, expandObjects(mk(7).objects));
  assert.notDeepEqual(a, expandObjects(mk(8).objects));
  assert.ok(a.every((o) => Math.hypot(o.pos![0], o.pos![2]) <= 10));
});

test("expandObjects suffixes children of a repeated group and keeps groups as nodes", () => {
  const house = { id: "house", kind: "group", children: [box("wall")] };
  const s = checkScene(base([{ id: "street", kind: "repeat", repeat: { mode: "grid", count: 2, of: house } }]));
  const out = expandObjects(s.objects);
  assert.deepEqual(out.map((o) => o.id), ["house#0", "house#1"]);
  assert.deepEqual(flat(out).map((o) => o.id), ["wall#0", "wall#1"]);
});

test("a repeater expanding past 2000 objects is rejected, naming the id and the expanded count", () => {
  assert.throws(
    () => checkScene(base([{ id: "forest", kind: "repeat", repeat: { mode: "scatter", count: 2001, of: box("tree") } }])),
    /repeater "forest" expands to 2001 objects/,
  );
  const nested = { id: "outer", kind: "repeat", repeat: { mode: "grid", count: 50, of: { id: "inner", kind: "repeat", repeat: { mode: "grid", count: 50, of: box("x") } } } };
  assert.throws(() => checkScene(base([nested])), /repeater "outer" expands to 2500 objects/);
});

test("total expansion across objects is limited too", () => {
  const r = (id: string) => ({ id, kind: "repeat", repeat: { mode: "grid", count: 1500, of: box(`${id}-t`) } });
  assert.throws(() => checkScene(base([r("a"), r("b")])), /expands to 3000 objects/);
});

test("terrain and text objects are validated", () => {
  assert.doesNotThrow(() =>
    checkScene(base([
      { id: "hill", kind: "terrain", terrain: { size: [100, 100], height: 5, scale: 20, octaves: 3, seed: 1 } },
      { id: "sign", kind: "text", text: "Hello" },
    ])),
  );
  assert.throws(() => checkScene(base([{ id: "hill", kind: "terrain", terrain: { size: [100, 100], height: 5, scale: 20, octaves: 99, seed: 1 } }])), /objects\[0\]\.terrain\.octaves/);
  assert.throws(() => checkScene(base([{ id: "sign", kind: "text" }])), /objects\[0\]\.text/);
});
