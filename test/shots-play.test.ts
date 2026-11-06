import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFilmTimeline, captionFor, chapterFractions, ease, endCardLine, endCardStart, endCardTick, END_COUNTDOWN_MS, filmLabel, filmPositionAt, focusRing, pathSample,
  playAll, resolveLook, sampleShot, seekToShot,
} from "../web/shots-play.ts";
import type { Film, Shot } from "../src/shots.ts";

const shot = (over: Partial<Shot> = {}): Shot => ({ id: "s", name: "S", from: { pos: [0, 0, 0], look: [0, 0, 10] }, to: { pos: [10, 0, 0], look: [10, 0, 10] }, duration_ms: 1000, ...over });
const film = (...d: number[]): Film => ({ id: "f", name: "F", shots: d.map((duration_ms, i) => ({ ...shot(), id: `s${i}`, duration_ms })) });
const none = () => null;
const noNaN = (v: number[]) => v.every((n) => Number.isFinite(n));

test("ease endpoints and midpoints", () => {
  for (const k of ["linear", "in-out", "out"] as const) { assert.equal(ease(k, 0), 0); assert.equal(ease(k, 1), 1); }
  assert.equal(ease("linear", 0.25), 0.25);
  assert.equal(ease("in-out", 0.5), 0.5);
  assert.equal(ease("in-out", 0.25), 4 * 0.25 ** 3);
  assert.equal(ease("out", 0.5), 0.875);
  assert.equal(ease("linear", -3), 0);
  assert.equal(ease("out", 7), 1);
  assert.equal(ease("in-out", NaN), 0);
});

test("pathSample: straight line without waypoints, hits waypoints exactly", () => {
  assert.deepEqual(pathSample([0, 0, 0], [], [10, 20, 30], 0.5), [5, 10, 15]);
  assert.deepEqual(pathSample([0, 0, 0], [], [10, 20, 30], 0), [0, 0, 0]);
  assert.deepEqual(pathSample([0, 0, 0], [], [10, 20, 30], 1), [10, 20, 30]);
  const wp: [number, number, number] = [5, 8, 1];
  assert.deepEqual(pathSample([0, 0, 0], [wp], [10, 0, 0], 0.5), wp);
  const w2: [number, number, number] = [3, 4, 5], w3: [number, number, number] = [7, -2, 9];
  assert.deepEqual(pathSample([0, 0, 0], [w2, w3], [10, 0, 0], 1 / 3), w2);
  assert.deepEqual(pathSample([0, 0, 0], [w2, w3], [10, 0, 0], 2 / 3), w3);
  const mid = pathSample([0, 0, 0], [wp], [10, 0, 0], 0.25);
  assert.ok(noNaN(mid) && mid[1] > 0 && mid[1] < 8);
  assert.deepEqual(pathSample([0, 0, 0], [wp], [10, 0, 0], NaN), [0, 0, 0]);
});

test("resolveLook: vector, object centre, fallback", () => {
  assert.deepEqual(resolveLook({ pos: [0, 0, 0], look: [1, 2, 3] }, none, [9, 9, 9]), [1, 2, 3]);
  assert.deepEqual(resolveLook({ pos: [0, 0, 0], look: "tower" }, (id) => (id === "tower" ? [4, 5, 6] : null), [9, 9, 9]), [4, 5, 6]);
  assert.deepEqual(resolveLook({ pos: [0, 0, 0], look: "gone" }, none, [9, 9, 9]), [9, 9, 9]);
});

test("sampleShot equals the views at t 0 and 1, eases between", () => {
  const s = shot();
  assert.deepEqual(sampleShot(s, 0, none), { pos: [0, 0, 0], look: [0, 0, 10] });
  assert.deepEqual(sampleShot(s, 1, none), { pos: [10, 0, 0], look: [10, 0, 10] });
  assert.deepEqual(sampleShot(s, 0.5, none), { pos: [5, 0, 0], look: [5, 0, 10] });
  assert.deepEqual(sampleShot(shot({ ease: "linear" }), 0.25, none).pos, [2.5, 0, 0]);
  assert.deepEqual(sampleShot(shot({ ease: "out" }), 0.5, none).pos, [8.75, 0, 0]);
  assert.deepEqual(sampleShot(s, -1, none).pos, [0, 0, 0]);
  assert.deepEqual(sampleShot(s, 5, none).pos, [10, 0, 0]);
});

test("sampleShot resolves look-at objects on every call and falls back when they vanish", () => {
  const s = shot({ from: { pos: [0, 0, 0], look: "a" }, to: { pos: [1, 0, 0], look: "b" } });
  let c: Record<string, [number, number, number]> = { a: [0, 0, 0], b: [10, 0, 0] };
  const oc = (id: string) => c[id] ?? null;
  assert.deepEqual(sampleShot(s, 0, oc).look, [0, 0, 0]);
  assert.deepEqual(sampleShot(s, 1, oc).look, [10, 0, 0]);
  c = { a: [0, 0, 0], b: [20, 0, 0] };
  assert.deepEqual(sampleShot(s, 1, oc).look, [20, 0, 0]);
  c = { a: [4, 0, 0] };
  assert.deepEqual(sampleShot(s, 1, oc).look, [4, 0, 0]);
  assert.deepEqual(sampleShot(s, 0.5, oc).look, [4, 0, 0]);
  assert.deepEqual(sampleShot(s, 0.5, none).look, [0, 0, 0]);
});

test("timeline starts for [8000, 9000, 7000]", () => {
  assert.deepEqual(buildFilmTimeline(film(8000, 9000, 7000)), { total_ms: 24000, starts: [0, 8000, 17000] });
  assert.deepEqual(buildFilmTimeline(film()), { total_ms: 0, starts: [] });
});

test("filmPositionAt: boundaries belong to the next shot, the total is done", () => {
  const f = film(8000, 9000, 7000);
  assert.deepEqual(filmPositionAt(f, 0), { shot: 0, t: 0, done: false });
  assert.deepEqual(filmPositionAt(f, 4000), { shot: 0, t: 0.5, done: false });
  assert.deepEqual(filmPositionAt(f, 7999), { shot: 0, t: 7999 / 8000, done: false });
  assert.deepEqual(filmPositionAt(f, 8000), { shot: 1, t: 0, done: false });
  assert.deepEqual(filmPositionAt(f, 17000), { shot: 2, t: 0, done: false });
  assert.deepEqual(filmPositionAt(f, 24000), { shot: 2, t: 1, done: true });
  assert.deepEqual(filmPositionAt(f, 99999), { shot: 2, t: 1, done: true });
  assert.deepEqual(filmPositionAt(f, -5), { shot: 0, t: 0, done: false });
  assert.deepEqual(filmPositionAt(f, NaN), { shot: 0, t: 0, done: false });
});

test("seekToShot clamps", () => {
  const f = film(8000, 9000, 7000);
  assert.equal(seekToShot(f, 0), 0);
  assert.equal(seekToShot(f, 1), 8000);
  assert.equal(seekToShot(f, 2), 17000);
  assert.equal(seekToShot(f, 9), 17000);
  assert.equal(seekToShot(f, -1), 0);
  assert.equal(seekToShot(f, NaN), 0);
  assert.equal(seekToShot(film(), 3), 0);
});

test("chapterFractions sum to 1", () => {
  const fr = chapterFractions(film(8000, 9000, 7000));
  assert.deepEqual(fr, [8000 / 24000, 9000 / 24000, 7000 / 24000]);
  assert.ok(Math.abs(fr.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.deepEqual(chapterFractions(film(1000, 1000)), [0.5, 0.5]);
  assert.deepEqual(chapterFractions(film()), []);
  assert.deepEqual(chapterFractions(film(0, 0)), [0.5, 0.5]);
});

test("invalid inputs never give NaN", () => {
  assert.deepEqual(filmPositionAt(film(), 100), { shot: 0, t: 0, done: true });
  const zero = film(0, 0);
  assert.deepEqual(buildFilmTimeline(zero), { total_ms: 0, starts: [0, 0] });
  assert.deepEqual(filmPositionAt(zero, 0), { shot: 1, t: 1, done: true });
  assert.deepEqual(filmPositionAt(film(0, 1000), 0), { shot: 1, t: 0, done: false });
  assert.equal(buildFilmTimeline(film(NaN, 1000)).total_ms, 1000);
  const s0 = sampleShot(shot({ duration_ms: 0 }), NaN, none);
  assert.ok(noNaN(s0.pos) && noNaN(s0.look));
  assert.equal(focusRing(shot({ focus: "a", duration_ms: 0 }), 0).alpha, 0);
  assert.equal(focusRing(shot({ focus: "a" }), NaN).alpha, 0);
});

test("filmLabel", () => {
  assert.equal(filmLabel(film(8000, 8000, 8000, 8000, 8000)), "5 shots · about 40 s");
  assert.equal(filmLabel(film(10000)), "1 shot · about 10 s");
  assert.equal(filmLabel(film(60000, 60000)), "2 shots · about 2 min");
  assert.equal(filmLabel(film()), "no shots");
});

test("focusRing fades over the first and last 500 ms", () => {
  const s = shot({ focus: "tower", duration_ms: 8000 });
  const a = (ms: number) => focusRing(s, ms);
  assert.deepEqual(a(0), { object: "tower", alpha: 0 });
  assert.equal(a(250).alpha, 0.5);
  assert.equal(a(500).alpha, 1);
  assert.equal(a(4000).alpha, 1);
  assert.equal(a(7750).alpha, 0.5);
  assert.equal(a(8000).alpha, 0);
  assert.deepEqual(focusRing(shot(), 500), { object: null, alpha: 0 });
  assert.equal(focusRing(shot({ focus: "t", duration_ms: 600 }), 300).alpha, 0.6);
});

test("captionFor, playAll and the end card countdown", () => {
  assert.equal(captionFor(shot({ caption: "Hello" }), true), "Hello");
  assert.equal(captionFor(shot({ caption: "Hello" }), false), null);
  assert.equal(captionFor(shot(), true), null);
  assert.equal(captionFor(undefined, true), null);
  const fs = [film(1000), film(1000), film(1000)];
  assert.deepEqual(playAll(fs, 0), { next: 1 });
  assert.deepEqual(playAll(fs, 2), { next: null });
  assert.deepEqual(playAll([], 0), { next: null });
  const c = endCardStart(1);
  assert.equal(endCardLine("Tour", c), "Up next: Tour, starting in 5 s");
  assert.equal(endCardTick(c, END_COUNTDOWN_MS).fire, true);
});
