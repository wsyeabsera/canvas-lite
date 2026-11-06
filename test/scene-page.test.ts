import { test } from "node:test";
import assert from "node:assert/strict";
import { activeSection, cardHeight, OVERLAY_SANDBOX, overlaySrcdoc, pageLayout, pageProgress, railDots, resolveFilmLooks } from "../web/scene-page.ts";
import { cameraAt } from "../web/page-scroll.ts";
import type { Section } from "../src/page-model.ts";
import type { Film } from "../src/shots.ts";

const sec = (o: Partial<Section> = {}): Section => ({ id: "a", html: "<h1>Hi</h1>", shot: "s1", ...o });

test("cardHeight: min(70vh, 520px), capped at 90% of a short section", () => {
  assert.equal(cardHeight(sec(), 1000), 520);
  assert.equal(cardHeight(sec(), 600), 420);
  assert.equal(cardHeight(sec({ height_vh: 50 }), 1000), 450);
  assert.equal(cardHeight(sec({ height_vh: 50 }), 100), 120); // never below 120 px
});

test("pageLayout: ranges, defaults, track height = last end + one viewport", () => {
  const l = pageLayout([sec({ id: "a" }), sec({ id: "b", title: "Two", align: "right", gap_vh: 50, height_vh: 200 })], 800);
  assert.equal(l.track, 800 + 400 + 1600 + 800);
  assert.deepEqual(l.sections.map((s) => [s.id, s.title, s.align, s.start, s.end]), [["a", "Section 1", "left", 0, 800], ["b", "Two", "right", 1200, 2800]]);
  assert.equal(pageLayout([], 800).track, 800);
});

test("activeSection: inclusive start, gaps keep the previous section, before the first is -1", () => {
  const r = [{ start: 100, end: 200 }, { start: 300, end: 400 }];
  assert.deepEqual([0, 100, 199, 250, 300, 999].map((y) => activeSection(r, y)), [-1, 0, 0, 0, 1, 1]);
  assert.equal(activeSection([], 5), -1);
});

test("railDots and pageProgress are fractions of the last end", () => {
  const r = [{ start: 0, end: 100 }, { start: 150, end: 200 }];
  assert.deepEqual(railDots(r), [0, 0.75]);
  assert.equal(pageProgress(r, 100), 0.5);
  assert.equal(pageProgress(r, 500), 1);
  assert.equal(pageProgress(r, -5), 0);
  assert.deepEqual(railDots([]), []);
  assert.equal(pageProgress([], 10), 0);
});

test("resolveFilmLooks replaces string looks so cameraAt blends them instead of switching", () => {
  const films: Film[] = [{ id: "f", name: "F", shots: [{ id: "s1", name: "S", duration_ms: 1000, ease: "linear", from: { pos: [0, 0, 0], look: "a" }, to: { pos: [10, 0, 0], look: "b" } }] }];
  const pts: Record<string, [number, number, number]> = { a: [0, 0, 0], b: [10, 0, 0] };
  const r = resolveFilmLooks(films, (id) => pts[id]);
  assert.deepEqual(r[0].shots[0].from.look, [0, 0, 0]);
  assert.equal(films[0].shots[0].from.look, "a"); // input untouched
  const cam = cameraAt({ sections: [sec()] }, r, 50, 100)!;
  assert.deepEqual(cam.look, [5, 0, 0]);
});

test("overlay frames: empty sandbox and a non-scrolling srcdoc that wraps the html", () => {
  assert.equal(OVERLAY_SANDBOX, "");
  assert.doesNotMatch(OVERLAY_SANDBOX, /allow-scripts|allow-same-origin/);
  const d = overlaySrcdoc("<h1>Hello</h1>");
  assert.match(d, /^<!doctype html>/);
  assert.match(d, /overflow:hidden/);
  assert.match(d, /no-referrer/);
  assert.ok(d.includes("<body><h1>Hello</h1></body>"));
  assert.doesNotMatch(d, /<script/i);
});
