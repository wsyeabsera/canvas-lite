import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScene, type Scene } from "../src/scene.ts";
import { checkFilms, filmDuration, readFilms, FILMS_MAX, WAYPOINTS_MAX } from "../src/shots.ts";

const scene = (ids: string[] = ["tower", "gate"]): Scene =>
  checkScene({
    name: "Town",
    objects: ids.map((id) => ({ id, kind: "box" })),
    lights: [],
    sky: { top: "#000000", bottom: "#ffffff" },
    camera: { pos: [0, 1, 5], look: [0, 0, 0], fov: 50 },
  });
const shot = (id: string, extra: object = {}) => ({
  id, name: id, from: { pos: [0, 5, 20], look: [0, 0, 0] }, to: { pos: [0, 2, 8], look: "tower" }, duration_ms: 2000, ...extra,
});
const film = (shots: unknown[], id = "tour") => ({ id, name: "Tour", shots });

test("checkFilms accepts a 2-shot film", () => {
  const out = checkFilms([film([shot("a", { caption: "Hello", ease: "in-out", focus: "gate" }), shot("b", { waypoints: [[1, 2, 3]] })])], scene());
  assert.equal(out[0].shots.length, 2);
  assert.equal(out[0].shots[0].focus, "gate");
  assert.deepEqual(checkFilms([], scene()), []);
});

test("checkFilms names film and shot for an unknown focus object", () => {
  assert.throws(() => checkFilms([film([shot("a"), shot("b", { focus: "ghost" })])], scene()), /film "tour" shot 1: unknown focus object "ghost"/);
  assert.throws(() => checkFilms([film([shot("a", { to: { pos: [0, 0, 0], look: "ghost" } })])], scene()), /film "tour" shot 0 to\.look: unknown object id "ghost"/);
});

test("checkFilms rejects 499 ms and 60001 ms", () => {
  for (const ms of [499, 60001, 1000.5, NaN])
    assert.throws(() => checkFilms([film([shot("a", { duration_ms: ms })])], scene()), /film "tour" shot 0: duration_ms/);
  assert.doesNotThrow(() => checkFilms([film([shot("a", { duration_ms: 500 }), shot("b", { duration_ms: 60000 })])], scene()));
});

test("checkFilms rejects a missing id or name and non-finite positions", () => {
  assert.throws(() => checkFilms([film([{ ...shot("a"), id: undefined }])], scene()), /film "tour" shot 0: id/);
  assert.throws(() => checkFilms([film([{ ...shot("a"), name: "" }])], scene()), /film "tour" shot 0: name/);
  assert.throws(() => checkFilms([{ name: "x", shots: [shot("a")] }], scene()), /invalid film 0: id/);
  assert.throws(() => checkFilms([film([shot("a", { from: { pos: [0, Infinity, 0], look: [0, 0, 0] } })])], scene()), /shot 0 from\.pos\[1\]/);
});

test("checkFilms rejects 9 waypoints", () => {
  const wp = (n: number) => Array.from({ length: n }, () => [0, 0, 0]);
  assert.doesNotThrow(() => checkFilms([film([shot("a", { waypoints: wp(WAYPOINTS_MAX) })])], scene()));
  assert.throws(() => checkFilms([film([shot("a", { waypoints: wp(9) })])], scene()), /film "tour" shot 0: use at most 8 waypoints/);
});

test("checkFilms rejects 9 films, 31 shots and duplicate ids", () => {
  const films = Array.from({ length: FILMS_MAX + 1 }, (_, i) => film([shot("a")], `f${i}`));
  assert.throws(() => checkFilms(films, scene()), /use 0 to 8 films/);
  assert.throws(() => checkFilms([film(Array.from({ length: 31 }, (_, i) => shot(`s${i}`)))], scene()), /film "tour": use 1 to 30 shots/);
  assert.throws(() => checkFilms([film([shot("a")]), film([shot("a")])], scene()), /duplicate id "tour"/);
  assert.throws(() => checkFilms([film([shot("a"), shot("a")])], scene()), /shot 1: duplicate id "a"/);
});

test("filmDuration sums", () => {
  assert.equal(filmDuration(checkFilms([film([shot("a", { duration_ms: 1500 }), shot("b", { duration_ms: 2500 })])], scene())[0].shots), 4000);
  assert.equal(filmDuration([]), 0);
});

test("readFilms lists a shot under missing when its focus object is gone", () => {
  const films = checkFilms([film([shot("a", { focus: "gate" }), shot("b")])], scene());
  assert.deepEqual(readFilms(films, scene())[0].missing, []);
  const r = readFilms(films, scene(["tower"]));
  assert.deepEqual(r[0].missing, [0]);
  assert.equal(r[0].duration_ms, 4000);
  assert.deepEqual(readFilms(films, scene(["other"]))[0].missing, [0, 1]);
});
