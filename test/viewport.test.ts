import { test } from "node:test";
import assert from "node:assert/strict";
import { boundsOf, clampK, fitRect, MAX_K, MIN_K, panBy, pct, wheelZoomFactor, zoomAt, zoomTo, type View } from "../web/viewport.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const toScreen = (v: View, wx: number, wy: number) => [wx * v.k + v.x, wy * v.k + v.y] as const;

test("fitRect centres the bounds inside the padded viewport", () => {
  const v = fitRect({ x: 0, y: 0, w: 1920, h: 1080 }, { w: 1088, h: 800 }, 64);
  near(v.k, 960 / 1920);
  const [cx, cy] = toScreen(v, 960, 540);
  near(cx, 544);
  near(cy, 400);
  const tall = fitRect({ x: 100, y: 100, w: 390, h: 844 }, { w: 1200, h: 572 }, 64); // height limits
  near(tall.k, 444 / 844);
  const [lx] = toScreen(tall, 100, 100);
  near(lx, (1200 - 390 * tall.k) / 2);
});

test("fitRect clamps the scale and survives empty or tiny inputs", () => {
  assert.equal(fitRect({ x: 0, y: 0, w: 10, h: 10 }, { w: 1000, h: 1000 }).k, MAX_K);
  assert.equal(fitRect({ x: 0, y: 0, w: 1e7, h: 1e7 }, { w: 1000, h: 1000 }).k, MIN_K);
  assert.equal(fitRect({ x: 0, y: 0, w: 0, h: 0 }, { w: 1000, h: 1000 }).k, 1);
  assert.ok(Number.isFinite(fitRect({ x: 0, y: 0, w: 100, h: 100 }, { w: 0, h: 0 }).k));
});

test("zoomAt keeps the point under the cursor fixed and clamps", () => {
  const v: View = { x: 30, y: -40, k: 0.5 };
  const z = zoomAt(v, 1.6, 300, 200);
  near(z.k, 0.8);
  const wx = (300 - v.x) / v.k, wy = (200 - v.y) / v.k;
  const [sx, sy] = toScreen(z, wx, wy);
  near(sx, 300);
  near(sy, 200);
  assert.equal(zoomAt(v, 100, 0, 0).k, MAX_K);
  assert.equal(zoomAt(v, 0.0001, 0, 0).k, MIN_K);
  const clamped = zoomAt({ x: 0, y: 0, k: MAX_K }, 2, 50, 50);
  assert.deepEqual(clamped, { x: 0, y: 0, k: MAX_K }); // nothing moves at the limit
});

test("zoomTo, panBy, clampK", () => {
  const v = zoomTo({ x: 10, y: 10, k: 0.25 }, 1, 500, 400);
  near(v.k, 1);
  near(v.x, 500 - (500 - 10) * 4);
  assert.deepEqual(panBy({ x: 1, y: 2, k: 3 }, 10, -5), { x: 11, y: -3, k: 3 });
  assert.equal(clampK(NaN), 1);
  assert.equal(clampK(-1), 1);
  assert.equal(clampK(0.5), 0.5);
});

test("wheel zoom factor: gentle for pinch, bounded for a mouse notch, symmetric", () => {
  assert.ok(wheelZoomFactor(-4) > 1 && wheelZoomFactor(-4) < 1.05);
  assert.ok(wheelZoomFactor(100) > 0.6 && wheelZoomFactor(100) < 1);
  assert.equal(wheelZoomFactor(100), wheelZoomFactor(1000));
  near(wheelZoomFactor(30) * wheelZoomFactor(-30), 1);
  assert.equal(wheelZoomFactor(0), 1);
});

test("pct readout and boundsOf", () => {
  assert.equal(pct(1), "100%");
  assert.equal(pct(0.054), "5%");
  assert.equal(pct(0.3333), "33%");
  assert.equal(boundsOf([]), null);
  assert.deepEqual(boundsOf([{ x: 0, y: 0, w: 10, h: 10 }, { x: -5, y: 20, w: 10, h: 5 }]), { x: -5, y: 0, w: 15, h: 25 });
});
