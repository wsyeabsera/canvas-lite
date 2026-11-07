import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScene, expandedCount, expandObjects, objectIds, SCENE_NESTING_MAX, type SceneObject } from "../src/scene.ts";

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

test("a repeater of an empty group counts its group copies and is rejected (one level and nested)", () => {
  const empty = { id: "g", kind: "group", children: [] };
  assert.throws(
    () => checkScene(base([{ id: "r", kind: "repeat", repeat: { mode: "grid", count: 1_000_000, of: empty } }])),
    /repeater "r" expands to 1000000 objects \(limit 2000\)/,
  );
  const nested = { id: "o", kind: "repeat", repeat: { mode: "grid", count: 1_000_000, of: { id: "i", kind: "repeat", repeat: { mode: "grid", count: 1_000_000, of: empty } } } };
  assert.throws(() => checkScene(base([nested])), /repeater "o" expands to 1000000000000 objects/);
});

test("a repeater of a group with one child counts both: 2000 copies are 4000 objects", () => {
  const house = { id: "house", kind: "group", children: [box("wall")] };
  assert.throws(
    () => checkScene(base([{ id: "street", kind: "repeat", repeat: { mode: "grid", count: 2000, of: house } }])),
    /repeater "street" expands to 4000 objects/,
  );
  assert.doesNotThrow(() => checkScene(base([{ id: "street", kind: "repeat", repeat: { mode: "grid", count: 1000, of: house } }])));
  assert.equal(expandedCount(checkScene(base([{ id: "street", kind: "repeat", repeat: { mode: "grid", count: 3, of: house } }])).objects), 6);
});

test("expandObjects refuses on its own to expand past the limit, without allocating", () => {
  const huge = [{ id: "r", kind: "repeat", repeat: { mode: "grid", count: 1_000_000, of: { id: "g", kind: "group", children: [] } } }] as SceneObject[];
  assert.throws(() => expandObjects(huge), /expands to 1000000 objects \(limit 2000\)/);
});

test("nested repeaters give unique, deterministic expanded ids", () => {
  const nested = { id: "outer", kind: "repeat", repeat: { mode: "grid", count: 2, of: { id: "inner", kind: "repeat", repeat: { mode: "grid", count: 2, of: box("c") } } } };
  const out = expandObjects(checkScene(base([nested])).objects);
  const ids = out.map((o) => o.id);
  assert.deepEqual(ids, ["c#0#0", "c#0#1", "c#1#0", "c#1#1"]);
  const deep = { id: "o2", kind: "repeat", repeat: { mode: "ring", count: 3, of: { id: "grp", kind: "group", children: [nested, box("d")] } } };
  const all = flat(expandObjects(checkScene(base([deep])).objects)).map((o) => o.id);
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, 3 * 5);
});

test("object sizes must have the right length per kind and be non-negative", () => {
  const ok: [string, number[]][] = [["box", [1, 2, 3]], ["sphere", [1]], ["cylinder", [1, 2]], ["cone", [1, 2]], ["capsule", [1, 2]], ["torus", [2, 0.5]], ["plane", [10, 10]], ["text", [2]]];
  for (const [kind, size] of ok) assert.doesNotThrow(() => checkScene(base([{ id: "a", kind, size, ...(kind === "text" ? { text: "Hi" } : {}) }])), kind);
  assert.throws(() => checkScene(base([{ id: "a", kind: "cylinder", size: [8, 0.2, 8] }])), /objects\[0\]\.size: a cylinder size is \[radius, height\]/);
  assert.throws(() => checkScene(base([{ id: "a", kind: "box", size: [1, 2] }])), /objects\[0\]\.size: a box size is \[width, height, depth\]/);
  assert.throws(() => checkScene(base([box("a", { size: [1, -2, 3] })])), /objects\[0\]\.size\[1\]: must be from 0/);
  assert.throws(() => checkScene(base([{ id: "g", kind: "group", children: [], size: [1] }])), /objects\[0\]\.size: a group has no size/);
});

test("a repeater whose copies would land past 1000000 from the origin is rejected, naming its id", () => {
  assert.throws(
    () => checkScene(base([{ id: "far", kind: "repeat", pos: [999_000, 0, 0], repeat: { mode: "ring", count: 4, radius: 2000, of: box("t") } }])),
    /repeater "far" places copies up to 1001000 from the origin \(limit 1000000\)/,
  );
  assert.throws(
    () => checkScene(base([{ id: "wide", kind: "repeat", repeat: { mode: "grid", count: 100, spacing: 200_000, of: box("t") } }])),
    /repeater "wide" places copies up to 1800000/,
  );
  const nested = { id: "o", kind: "repeat", repeat: { mode: "ring", count: 2, radius: 600_000, of: { id: "i", kind: "repeat", repeat: { mode: "ring", count: 2, radius: 600_000, of: box("t") } } } };
  assert.throws(() => checkScene(base([nested])), /repeater "i" places copies up to 1200000/);
  assert.doesNotThrow(() => checkScene(base([{ id: "ok", kind: "repeat", pos: [990_000, 0, 0], repeat: { mode: "ring", count: 4, radius: 2000, of: box("t", { pos: [-5000, 0, 0] }) } }])));
});

test("a repeater inside a group counts the group's own pos (and outer groups') toward the position limit", () => {
  const rep = { id: "row", kind: "repeat", pos: [100, 0, 0], repeat: { mode: "ring", count: 4, radius: 10, of: box("t") } };
  assert.throws(
    () => checkScene(base([{ id: "g", kind: "group", pos: [999_950, 0, 0], children: [rep] }])),
    /repeater "row" places copies up to 1000060 from the origin \(limit 1000000\)/,
  );
  const inner = { id: "g2", kind: "group", pos: [0, 600_000, 0], children: [rep] };
  assert.throws(() => checkScene(base([{ id: "g1", kind: "group", pos: [0, 600_000, 0], children: [inner] }])), /repeater "row" places copies up to 1200000/);
  assert.doesNotThrow(() => checkScene(base([{ id: "g", kind: "group", pos: [100, 0, 0], children: [rep] }])));
});
