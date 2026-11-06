import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cameraT, clampPlayhead, CUT_FADE_MS, cutVeil, filmChip, filmFraction, filmPickerLine, filmsLabel, findFilm, nextShotMs, parseFilms, prevShotMs, ringBox, RING_MIN,
  seekFilmFraction, shotAtFraction, shotChapters, shotChip, shotScrubLabel, shotsLabel,
} from "../web/scene-watch.ts";
import { modeSegments, SCENE_MODES } from "../web/scene-modes.ts";
import type { Film, Shot } from "../src/shots.ts";

const shot = (id: string, duration_ms: number, over: Partial<Shot> = {}): Shot => ({ id, name: id.toUpperCase(), from: { pos: [0, 0, 0], look: [0, 0, 1] }, to: { pos: [1, 0, 0], look: "gate" }, duration_ms, ...over });
const film = (...d: number[]): Film => ({ id: "f", name: "F", shots: d.map((ms, i) => shot(`s${i}`, ms)) });

test("parseFilms keeps playable shots and films, drops broken ones, sums durations", () => {
  const raw = [
    { id: "tour", name: "Tour", description: "Round town", duration_ms: 99, missing: [], shots: [
      { id: "a", name: "Arrive", from: { pos: [0, 1, 2], look: "gate" }, to: { pos: [1, 1, 2], look: [0, 0, 0] }, duration_ms: 3000, ease: "out", caption: "We arrive", focus: "gate", waypoints: [[1, 2, 3], "x"] },
      { id: "bad-view", from: { pos: [0, 1] , look: "x" }, to: { pos: [0, 0, 0], look: "x" }, duration_ms: 1000 },
      { id: "bad-ms", from: { pos: [0, 0, 0], look: "x" }, to: { pos: [0, 0, 0], look: "x" }, duration_ms: 0 },
      { id: "b", from: { pos: [0, 0, 0], look: "x" }, to: { pos: [0, 0, 0], look: "x" }, duration_ms: 2000, ease: "wobble", caption: "  " },
    ] },
    { name: "no id", shots: [] },
    { id: "empty", shots: [] },
    null,
  ];
  const out = parseFilms(raw);
  assert.deepEqual(out.map((f) => f.id), ["tour", "empty"]);
  const t = out[0]!;
  assert.equal(t.duration_ms, 5000);
  assert.equal(t.description, "Round town");
  assert.deepEqual(t.shots.map((s) => s.id), ["a", "b"]);
  assert.deepEqual(t.shots[0], { id: "a", name: "Arrive", from: { pos: [0, 1, 2], look: "gate" }, to: { pos: [1, 1, 2], look: [0, 0, 0] }, duration_ms: 3000, ease: "out", caption: "We arrive", focus: "gate", waypoints: [[1, 2, 3]] });
  assert.equal(t.shots[1]!.name, "b"); // no name: the id
  assert.equal(t.shots[1]!.ease, undefined);
  assert.equal(t.shots[1]!.caption, undefined);
  assert.equal(out[1]!.name, "empty");
  assert.equal(out[1]!.duration_ms, 0);
  assert.deepEqual(parseFilms(null), []);
  assert.deepEqual(parseFilms({}), []);
});

test("findFilm, labels and chips", () => {
  const list = [{ id: "a" }, { id: "b" }];
  assert.equal(findFilm(list, "b"), 1);
  assert.equal(findFilm(list, "x"), -1);
  assert.equal(findFilm(list, null), -1);
  assert.equal(filmsLabel(1), "1 film");
  assert.equal(filmsLabel(3), "3 films");
  assert.equal(shotsLabel(1), "1 shot");
  assert.equal(shotsLabel(0), "0 shots");
  assert.equal(filmPickerLine("Harbor town", [film(20_000, 20_000), film(60_000)]), "Harbor town · 2 films · about 1 min 40 s");
  assert.equal(shotChip(1, { name: "The gate" }), "Shot 2 · The gate");
  assert.equal(shotScrubLabel(1, { name: "The gate", caption: "Through the gate" }), "2 · Through the gate");
  assert.equal(shotScrubLabel(0, { name: "The gate" }), "1 · The gate");
  assert.equal(filmChip(0, 3), "Film 1 of 3");
});

test("scrubber: chapters, fractions and seeking land on shot starts", () => {
  const f = film(1000, 3000);
  assert.deepEqual(shotChapters(f), [{ start: 0, width: 0.25 }, { start: 0.25, width: 0.75 }]);
  assert.deepEqual(shotChapters(film()), []);
  assert.equal(filmFraction(f, 2000), 0.5);
  assert.equal(filmFraction(f, 9999), 1);
  assert.equal(filmFraction(f, -5), 0);
  assert.equal(filmFraction(film(), 10), 0);
  assert.equal(shotAtFraction(f, 0), 0);
  assert.equal(shotAtFraction(f, 0.2), 0);
  assert.equal(shotAtFraction(f, 0.25), 1);
  assert.equal(shotAtFraction(f, 1), 1);
  assert.equal(shotAtFraction(f, NaN), 0);
  assert.equal(seekFilmFraction(f, 0.9), 1000);
  assert.equal(seekFilmFraction(f, 0.1), 0);
});

test("previous and next shot", () => {
  const f = film(1000, 2000, 3000);
  assert.equal(prevShotMs(f, 0), 0);
  assert.equal(prevShotMs(f, 500), 0);
  assert.equal(prevShotMs(f, 1500), 0);
  assert.equal(prevShotMs(f, 3500), 1000);
  assert.equal(prevShotMs(f, 6000), 1000); // at the end: the shot before the last
  assert.equal(nextShotMs(f, 0), 1000);
  assert.equal(nextShotMs(f, 1500), 3000);
  assert.equal(nextShotMs(f, 3500), 6000); // from the last shot: the end
  assert.equal(nextShotMs(f, 6000), 6000);
  assert.equal(prevShotMs(film(), 10), 0);
  assert.equal(nextShotMs(film(), 10), 0);
});

test("live data keeps the playhead clamped to the film", () => {
  const f = film(1000, 2000);
  assert.equal(clampPlayhead(f, 1500), 1500);
  assert.equal(clampPlayhead(f, 9000), 3000);
  assert.equal(clampPlayhead(f, -3), 0);
  assert.equal(clampPlayhead(f, NaN), 0);
});

test("reduced motion: each shot holds its start view and fades in from black over 300 ms", () => {
  assert.equal(cameraT(0.6, false), 0.6);
  assert.equal(cameraT(0.6, true), 0);
  assert.equal(cutVeil(0, false), 0);
  assert.equal(cutVeil(100, false), 0);
  assert.equal(cutVeil(0, true), 1);
  assert.equal(cutVeil(CUT_FADE_MS / 2, true), 0.5);
  assert.equal(cutVeil(CUT_FADE_MS, true), 0);
  assert.equal(cutVeil(5000, true), 0);
  assert.equal(cutVeil(NaN, true), 1);
});

test("ringBox keeps a minimum size around small objects, centred", () => {
  assert.deepEqual(ringBox({ x: 10, y: 20, w: 100, h: 50 }), { x: 10, y: 20, w: 100, h: 50 });
  const r = ringBox({ x: 100, y: 100, w: 10, h: 4 });
  assert.equal(r.w, RING_MIN);
  assert.equal(r.h, RING_MIN);
  assert.equal(r.x + r.w / 2, 105);
  assert.equal(r.y + r.h / 2, 102);
});

test("scene modes: one array drives the switch; the current mode is marked", () => {
  assert.deepEqual(SCENE_MODES.map((m) => m.label), ["Orbit", "Watch"]);
  assert.deepEqual(modeSegments("watch", "lite", "town"), [
    { mode: "orbit", label: "Orbit", href: "#/project/lite/scene/town", current: false },
    { mode: "watch", label: "Watch", href: "#/project/lite/scene/town/watch", current: true },
  ]);
  assert.equal(modeSegments("orbit", "a", "b").filter((s) => s.current).length, 1);
});
