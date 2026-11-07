import { test } from "node:test";
import assert from "node:assert/strict";
import { cameraAt, ease, sampleView, sectionRanges } from "../web/page-scroll.ts";
import type { Film } from "../src/shots.ts";
import type { Section } from "../src/page-model.ts";

const shot = (id: string, from: number, to: number, extra: object = {}) =>
  ({ id, name: id, from: { pos: [from, 0, 0], look: [0, 0, 0] }, to: { pos: [to, 0, 0], look: [0, 0, 0] }, duration_ms: 1000, ease: "linear", ...extra });
const films = [{ id: "f", name: "F", shots: [shot("a", 0, 10), shot("b", 10, 20), shot("c", 20, 40)] }] as unknown as Film[];
const sec = (id: string, shotRef: Section["shot"], extra: Partial<Section> = {}): Section => ({ id, html: "x", shot: shotRef, ...extra });
const VH = 1000;
const x = (c: ReturnType<typeof cameraAt>) => c!.pos[0];

test("sectionRanges stacks sections with heights and gaps", () => {
  assert.deepEqual(sectionRanges([{}, { height_vh: 200 }, { gap_vh: 50, height_vh: 50 }], VH), [
    { start: 0, end: 1000 }, { start: 1000, end: 3000 }, { start: 3500, end: 4000 },
  ]);
  assert.deepEqual(sectionRanges([], VH), []);
});

test("a single shot plays start to end across its range", () => {
  const page = { sections: [sec("one", "a")] };
  assert.equal(x(cameraAt(page, films, 0, VH)), 0);
  assert.equal(x(cameraAt(page, films, 250, VH)), 2.5);
  const mid = cameraAt(page, films, 500, VH)!;
  assert.deepEqual([mid.pos[0], mid.progress, mid.section], [5, 0.5, 0]);
  assert.ok(Math.abs(x(cameraAt(page, films, 999.999, VH)) - 10) < 1e-3);
});

test("a pair goes from the first shot's start to the second shot's end", () => {
  const page = { sections: [sec("pair", ["a", "c"], { height_vh: 200 })] };
  assert.equal(x(cameraAt(page, films, 0, VH)), 0);
  assert.equal(x(cameraAt(page, films, 1000, VH)), 20); // halfway of 0 -> 40
  assert.equal(cameraAt(page, films, 1000, VH)!.progress, 0.5);
  assert.equal(x(cameraAt(page, films, 5000, VH)), 40);
});

test("consecutive sections hand over exactly at the boundary", () => {
  const page = { sections: [sec("one", "a"), sec("two", "b")] };
  assert.deepEqual([cameraAt(page, films, 999, VH)!.section, cameraAt(page, films, 1000, VH)!.section], [0, 1]);
  assert.equal(x(cameraAt(page, films, 1000, VH)), 10);
  assert.equal(x(cameraAt(page, films, 1500, VH)), 15);
});

test("in a gap the camera holds the previous end view", () => {
  const page = { sections: [sec("one", "a"), sec("two", "b", { gap_vh: 50 })] };
  for (const y of [1000, 1200, 1499]) {
    const c = cameraAt(page, films, y, VH)!;
    assert.deepEqual([c.pos[0], c.section, c.progress], [10, null, 1]);
  }
  assert.deepEqual([cameraAt(page, films, 1500, VH)!.section, x(cameraAt(page, films, 2000, VH))], [1, 15]);
});

test("before the first section the camera sits at its start view; after the last it holds the end view", () => {
  const page = { sections: [sec("one", "a", { gap_vh: 50 }), sec("two", "b")] };
  const before = cameraAt(page, films, 100, VH)!;
  assert.deepEqual([before.pos[0], before.section, before.progress], [0, null, 0]);
  assert.equal(cameraAt(page, films, -50, VH)!.pos[0], 0);
  const after = cameraAt(page, films, 99999, VH)!;
  assert.deepEqual([after.pos[0], after.section, after.progress], [20, null, 1]);
});

test("a section whose shot is missing is skipped; nothing resolvable gives null", () => {
  assert.equal(cameraAt({ sections: [sec("gone", "zz"), sec("b", "b")] }, films, 1500, VH)!.section, 1);
  assert.equal(cameraAt({ sections: [sec("gone", "zz")] }, films, 10, VH), null);
  assert.equal(cameraAt({ sections: [] }, films, 10, VH), null);
});

test("sampleView: easing, waypoints and look", () => {
  const s = shot("w", 0, 10, { waypoints: [[5, 10, 0]] }) as any;
  assert.deepEqual(sampleView(s, 0).pos, [0, 0, 0]);
  assert.deepEqual(sampleView(s, 1).pos, [10, 0, 0]);
  const m = sampleView(s, 0.5).pos;
  assert.ok(Math.abs(m[0] - 5) < 1e-9 && Math.abs(m[1] - 10) < 1e-9);
  assert.equal(ease("linear", 0.25), 0.25);
  assert.equal(ease("in-out", 0.5), 0.5);
  assert.ok(ease("in-out", 0.25) < 0.25);
  assert.ok(ease("out", 0.25) > 0.25);
  assert.equal(ease(undefined, 2), 1);
  const o = { from: { pos: [0, 0, 0], look: "a" }, to: { pos: [1, 0, 0], look: "b" }, ease: "linear" } as any;
  assert.deepEqual([sampleView(o, 0.25).look, sampleView(o, 0.75).look], ["a", "b"]);
  const l = { from: { pos: [0, 0, 0], look: [0, 0, 0] }, to: { pos: [0, 0, 0], look: [10, 0, 0] }, ease: "linear" } as any;
  assert.deepEqual(sampleView(l, 0.5).look, [5, 0, 0]);
});
