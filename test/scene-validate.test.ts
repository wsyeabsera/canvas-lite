import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScene, type Scene } from "../src/scene.ts";
import type { Film } from "../src/shots.ts";
import { validateScene } from "../src/scene-validate.ts";

const mk = (objects: unknown[], lights: unknown[] = [{ id: "sun", kind: "sun", color: "#ffffff", intensity: 1 }]): Scene =>
  checkScene({ name: "S", objects, lights, sky: { top: "#000000", bottom: "#ffffff" }, camera: { pos: [0, 1, 5], look: [0, 0, 0], fov: 50 } });
const BOX = { id: "wall", kind: "box", pos: [0, 0, 0], size: [4, 4, 4] };
const film = (to: [number, number, number], ms = 5000, look: any = [0, 0, 0]): Film => ({
  id: "tour", name: "Tour", shots: [{ id: "a", name: "A", from: { pos: [0, 0, 20], look }, to: { pos: to, look }, duration_ms: ms }],
});
const kinds = (r: ReturnType<typeof validateScene>) => r.issues.map((i) => i.kind);

test("camera inside a box is an error naming the shot", () => {
  const r = validateScene(mk([BOX]), [film([1, 1, 1])]);
  assert.equal(r.ok, false);
  const i = r.issues.find((x) => x.kind === "camera_inside_solid")!;
  assert.equal(i.severity, "error");
  assert.equal(i.film, "tour");
  assert.equal(i.shot, 0);
  assert.equal(i.object, "wall");
  assert.match(i.message, /film "tour" shot 0.*to position.*"wall"/);
});

test("a camera just outside the box is fine", () => {
  assert.deepEqual(kinds(validateScene(mk([BOX]), [film([2.01, 0, 0])])), []);
});

test("group offsets and repeater copies count", () => {
  const g = { id: "g", kind: "group", pos: [10, 0, 0], children: [{ id: "c", kind: "box", size: [2, 2, 2] }] };
  assert.equal(validateScene(mk([g]), [film([10, 0, 0])]).ok, false);
  assert.equal(validateScene(mk([g]), [film([0, 0, 0])]).ok, true);
  const rep = { id: "r", kind: "repeat", repeat: { mode: "grid", count: 4, spacing: 10, of: { id: "t", kind: "box", size: [2, 2, 2] } } };
  const bad = validateScene(mk([rep]), [film([10, 0, 10])]);
  assert.equal(bad.issues.find((i) => i.kind === "camera_inside_solid")?.object, "t#3");
});

test("empty scene is info, not error", () => {
  const r = validateScene(mk([]), []);
  assert.deepEqual(r.issues.map((i) => [i.kind, i.severity]), [["empty_scene", "info"]]);
  assert.equal(r.ok, true);
});

test("no lights is a warning", () => {
  const r = validateScene(mk([BOX], []), []);
  assert.deepEqual(r.issues.map((i) => [i.kind, i.severity]), [["no_lights", "warning"]]);
});

test("film under 3 s is a warning", () => {
  const r = validateScene(mk([BOX]), [film([20, 0, 0], 2999)]);
  assert.deepEqual(r.issues.map((i) => [i.kind, i.severity, i.film]), [["film_too_short", "warning", "tour"]]);
  assert.deepEqual(kinds(validateScene(mk([BOX]), [film([20, 0, 0], 3000)])), []);
});

test("ok is true with warnings only", () => {
  const r = validateScene(mk([], []), [film([0, 0, 0], 1000)]);
  assert.deepEqual(kinds(r).sort(), ["empty_scene", "film_too_short", "no_lights"]);
  assert.equal(r.ok, true);
});

test("a shot looking at a vanished object is an error", () => {
  const r = validateScene(mk([BOX]), [film([20, 0, 0], 5000, "ghost")]);
  assert.equal(r.ok, false);
  const bad = r.issues.filter((i) => i.kind === "shot_looks_at_nothing");
  assert.equal(bad.length, 2);
  assert.equal(bad[0].object, "ghost");
  assert.equal(bad[0].shot, 0);
});

test("a shot whose focus object vanished is a focus_missing error", () => {
  const f = film([20, 0, 0]);
  f.shots[0].focus = "ghost";
  const r = validateScene(mk([BOX]), [f]);
  assert.equal(r.ok, false);
  const bad = r.issues.filter((i) => i.kind === "focus_missing");
  assert.equal(bad.length, 1);
  assert.deepEqual([bad[0].severity, bad[0].object, bad[0].film, bad[0].shot], ["error", "ghost", "tour", 0]);
  assert.match(bad[0].fix, /focus/);
  f.shots[0].focus = "wall";
  assert.equal(validateScene(mk([BOX]), [f]).ok, true);
});

test("a negative size cannot hide the camera inside a solid (sizes are checked)", () => {
  assert.throws(() => mk([{ ...BOX, size: [-4, -4, -4] }]), /objects\[0\]\.size\[0\]/);
});
