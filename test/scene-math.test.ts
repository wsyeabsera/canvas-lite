import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boxCorners, cameraBasis, projectPoint, screenBox, farFor, fbm, fromOrbit, fullSize, hexToInt, instanceable, mixRgb, ORBIT_MAX_RADIUS, ORBIT_MIN_RADIUS, ORBIT_PHI_DRAG_MAX, orbitAxes, orbitPan, orbitRotate, orbitZoom,
  parseHex, shouldDraw, skyAt, terrainGrid, terrainHeight, terrainSegments, toOrbit, toRadians, valueNoise,
} from "../web/scene-math.ts";
import type { Terrain, Vec3 } from "../src/scene.ts";

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const closeV = (a: number[], b: number[], eps = 1e-9) => a.forEach((v, i) => close(v, b[i], eps));

test("projection: cameraBasis, projectPoint and screenBox match a lookAt camera with world up +Y", () => {
  const b = cameraBasis([0, 0, 10], [0, 0, 0]);
  closeV(b.forward, [0, 0, -1]);
  closeV(b.right, [1, 0, 0]);
  closeV(b.up, [0, 1, 0]);
  const down = cameraBasis([0, 10, 0], [0, 0, 0]); // straight down: +X stays right
  closeV(down.right, [1, 0, 0]);
  closeV(down.forward, [0, -1, 0]);
  const cam = { pos: [0, 0, 10] as Vec3, look: [0, 0, 0] as Vec3, fov: 90 };
  const c = projectPoint(cam, 1, [0, 0, 0]);
  close(c.x, 0); close(c.y, 0); close(c.depth, 10);
  const edge = projectPoint(cam, 1, [10, 10, 0]); // tan(45 deg) = 1: the corner of the view at depth 10
  close(edge.x, 1); close(edge.y, 1);
  close(projectPoint(cam, 2, [10, 0, 0]).x, 0.5); // a wider view squeezes x
  assert.ok(projectPoint(cam, 1, [0, 0, 20]).depth < 0); // behind
  assert.equal(boxCorners([0, 0, 0], [1, 2, 3]).length, 8);
  // a 2 x 2 x 2 box at the centre, 10 away, fov 90 on 800 x 800: its front face (depth 9) spans 800 / 9 px around (400, 400)
  const box = screenBox(cam, 800, 800, [-1, -1, -1], [1, 1, 1])!;
  close(box.x + box.w / 2, 400); close(box.y + box.h / 2, 400);
  close(box.w, 800 / 9, 1e-6);
  close(screenBox(cam, 800, 800, [-1, -1, -1], [1, 1, 1], 10)!.w, box.w + 20, 1e-6);
  assert.ok(screenBox(cam, 800, 800, [-1, 3, -1], [1, 4, 1])!.y < box.y); // higher in the world is higher on screen
  const big = screenBox(cam, 800, 800, [-100, -1, -1], [100, 1, 1])!; // clipped to the viewport
  close(big.x, 0); close(big.w, 800);
  assert.equal(screenBox(cam, 800, 800, [200, 0, 0], [201, 1, 1]), null); // off screen
  assert.equal(screenBox(cam, 800, 800, [-1, -1, 20], [1, 1, 22]), null); // behind the camera
  assert.equal(screenBox(cam, 0, 800, [-1, -1, -1], [1, 1, 1]), null);
});

test("colours: parseHex, hexToInt, mixRgb and the sky gradient", () => {
  assert.deepEqual(parseHex("#ff0000"), [1, 0, 0]);
  closeV(parseHex("#336699"), [0.2, 0.4, 0.6]);
  assert.deepEqual(parseHex("nope"), [0.5, 0.5, 0.5]);
  assert.equal(hexToInt("#336699"), 0x336699);
  assert.equal(hexToInt("#12"), 0x808080);
  closeV(mixRgb("#000000", "#ffffff", 0.5), [0.5, 0.5, 0.5]);
  closeV(mixRgb("#000000", "#ffffff", 2), [1, 1, 1]);
  closeV(skyAt("#ffffff", "#000000", -0.5), [0, 0, 0]); // below the horizon: bottom
  closeV(skyAt("#ffffff", "#000000", 0), [0, 0, 0]);
  closeV(skyAt("#ffffff", "#000000", 1), [1, 1, 1]); // straight up: top
  const mid = skyAt("#ffffff", "#000000", 0.25)[0];
  assert.ok(mid > 0.25 && mid < 1, "eases quickly away from the horizon");
});

test("fullSize fills the documented defaults per kind", () => {
  assert.deepEqual(fullSize("box"), [1, 1, 1]);
  assert.deepEqual(fullSize("box", [2, 3, 4]), [2, 3, 4]);
  assert.deepEqual(fullSize("cylinder"), [1, 2]);
  assert.deepEqual(fullSize("cone", [3]), [3, 2]);
  assert.deepEqual(fullSize("capsule"), [1, 2]);
  assert.deepEqual(fullSize("torus"), [1, 0.3]);
  assert.deepEqual(fullSize("sphere", [0]), [0]);
  assert.deepEqual(fullSize("text"), [1]);
  assert.deepEqual(fullSize("group"), []);
});

test("instanceable: a repeater of one primitive, not of a group, text or terrain", () => {
  const rep = (of: any) => ({ id: "r", kind: "repeat" as const, repeat: { mode: "grid" as const, count: 4, of } });
  assert.equal(instanceable(rep({ id: "t", kind: "cone" })), true);
  assert.equal(instanceable(rep({ id: "t", kind: "group", children: [] })), false);
  assert.equal(instanceable(rep({ id: "t", kind: "text", text: "x" })), false);
  assert.equal(instanceable({ id: "b", kind: "box" }), false);
});

test("toRadians converts degrees per axis", () => {
  closeV(toRadians([180, 90, -45]), [Math.PI, Math.PI / 2, -Math.PI / 4]);
  assert.deepEqual(toRadians(undefined), [0, 0, 0]);
});

test("noise is deterministic, in 0..1, seed-dependent and continuous", () => {
  assert.equal(valueNoise(1.3, 4.7, 9), valueNoise(1.3, 4.7, 9));
  assert.notEqual(valueNoise(1.3, 4.7, 9), valueNoise(1.3, 4.7, 10));
  let min = 1, max = 0;
  for (let i = 0; i < 2000; i++) {
    const v = fbm(i * 0.173, i * 0.311, 4, 7);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  assert.ok(min >= 0 && max <= 1, `${min}..${max}`);
  assert.ok(max - min > 0.3, "it actually varies");
  close(valueNoise(2.5, 3.5, 1), valueNoise(2.5 + 1e-7, 3.5, 1), 1e-5); // no jumps
  close(valueNoise(3, 3, 1), valueNoise(3 - 1e-9, 3, 1), 1e-6); // smooth across a lattice line
});

test("terrain heights scale with height and the grid matches the plane vertex order", () => {
  const t: Terrain = { size: [40, 20], height: 6, scale: 10, octaves: 3, seed: 42 };
  const h = terrainHeight(t, 3, -2);
  assert.ok(h >= 0 && h <= 6);
  close(terrainHeight({ ...t, height: 12 }, 3, -2), 2 * h);
  assert.equal(terrainHeight({ ...t, height: 0 }, 3, -2), 0);
  const g = terrainGrid(t, 4, 2);
  assert.equal(g.length, 5 * 3);
  close(g[0], terrainHeight(t, -20, -10), 1e-5); // first vertex: x = -w/2, z = -d/2
  close(g[4], terrainHeight(t, 20, -10), 1e-5); // end of the first row: x = +w/2
  close(g[5 + 2], terrainHeight(t, 0, 0), 1e-5); // middle row, middle column: the origin
  close(g[14], terrainHeight(t, 20, 10), 1e-5);
  assert.deepEqual(terrainSegments(t), [40, 20]);
  assert.deepEqual(terrainSegments({ ...t, size: [5, 500] }), [16, 128]);
});

test("orbit: toOrbit and fromOrbit round-trip", () => {
  for (const [pos, target] of [[[0, 20, 55], [0, 0, 14]], [[-30, 8, 20], [5, 1, -3]], [[10, 0, 0], [0, 0, 0]]] as [Vec3, Vec3][]) {
    closeV(fromOrbit(toOrbit(pos, target)), pos, 1e-9);
  }
  const o = toOrbit([0, 0, 10], [0, 0, 0]);
  close(o.theta, 0);
  close(o.phi, Math.PI / 2);
  close(o.radius, 10);
  const same = toOrbit([1, 1, 1], [1, 1, 1]);
  assert.equal(same.radius, ORBIT_MIN_RADIUS);
});

test("orbit: rotate keeps the distance, stays off the top pole and above the target's level", () => {
  const o = toOrbit([0, 0, 10], [0, 0, 0]);
  const r = orbitRotate(o, 100, 0);
  close(Math.hypot(...fromOrbit(r)), 10);
  assert.ok(fromOrbit(r)[0] < 0, "dragging right swings the camera to the left of the target");
  const up = orbitRotate(o, 0, 10_000);
  assert.ok(up.phi > 0 && up.phi < 0.1);
  const down = orbitRotate(o, 0, -10_000);
  assert.equal(down.phi, Math.PI / 2); // started exactly at the target's level: it may not go lower
  assert.equal(orbitRotate(toOrbit([0, 10, 10], [0, 0, 0]), 0, -10_000).phi, ORBIT_PHI_DRAG_MAX);
  assert.ok(fromOrbit(orbitRotate(toOrbit([0, 10, 10], [0, 0, 0]), 0, -10_000))[1] > 0, "never under the target");
  const below = toOrbit([0, -5, 10], [0, 0, 0]); // Claude set a camera below the target: dragging keeps it, never pushes it further down
  assert.ok(orbitRotate(below, 0, -100).phi <= below.phi + 1e-12);
});

test("orbit: zoom scales the distance by a factor, clamped", () => {
  const o = toOrbit([0, 0, 10], [0, 0, 0]);
  assert.ok(orbitZoom(o, 100).radius > 10);
  assert.ok(orbitZoom(o, -100).radius < 10);
  close(orbitZoom(orbitZoom(o, 100), -100).radius, 10, 1e-9);
  assert.equal(orbitZoom(o, 1e6).radius, ORBIT_MAX_RADIUS);
  assert.equal(orbitZoom(o, -1e6).radius, ORBIT_MIN_RADIUS);
});

test("orbit: axes are orthonormal and pan moves the target in the view plane", () => {
  const o = toOrbit([3, 7, 12], [1, 2, 3]);
  const { right, up } = orbitAxes(o);
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const fwd = fromOrbit(o).map((v, i) => o.target[i] - v) as Vec3;
  close(dot(right, right), 1);
  close(dot(up, up), 1);
  close(dot(right, up), 0);
  close(dot(right, fwd), 0);
  close(dot(up, fwd), 0);
  const front = toOrbit([0, 0, 10], [0, 0, 0]); // looking down -Z: right is +X, up is +Y
  closeV(orbitAxes(front).right, [1, 0, 0]);
  closeV(orbitAxes(front).up, [0, 1, 0]);
  const p = orbitPan(front, 100, 0, 90, 200); // 90 degrees over 200 px at distance 10: 0.1 units per px
  closeV(p.target, [-10, 0, 0], 1e-9); // dragging right moves the world right: the target goes left
  closeV(orbitPan(front, 0, 100, 90, 200).target, [0, 10, 0], 1e-9); // dragging down moves the target up
  assert.equal(p.radius, front.radius);
});

test("farFor and shouldDraw", () => {
  assert.equal(farFor(10, 10), 1000);
  assert.equal(farFor(500, 500), 4000);
  assert.equal(shouldDraw({ dirty: true, paused: false, hidden: false }), true);
  assert.equal(shouldDraw({ dirty: false, paused: false, hidden: false }), false);
  assert.equal(shouldDraw({ dirty: true, paused: true, hidden: false }), false);
  assert.equal(shouldDraw({ dirty: true, paused: false, hidden: true }), false);
});
