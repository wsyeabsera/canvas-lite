import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScene, type Scene } from "../src/scene.ts";
import type { Film } from "../src/shots.ts";
import { reviewScene } from "../src/scene-review.ts";
import { createScene, reviewStoredScene, SCENE_TEXT, setFilms, setScene } from "../src/scene-store.ts";
import { openProject } from "../src/projects.ts";
import { migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const SUN = { id: "sun", kind: "sun", color: "#ffd9a8", intensity: 1.4, pos: [40, 30, 20] };
const AIR = { id: "air", kind: "ambient", color: "#8aa4c8", intensity: 0.5 };
const mk = (objects: unknown[], o: { lights?: unknown[]; sky?: unknown } = {}): Scene =>
  checkScene({
    name: "S", objects, lights: o.lights ?? [SUN, AIR], sky: o.sky ?? { top: "#2c4a7a", bottom: "#f0b27a" },
    camera: { pos: [0, 6, 30], look: [0, 2, 0], fov: 50 },
  });
const GROUND = { id: "ground", kind: "plane", size: [100, 100], rot: [-90, 0, 0], material: { color: "#6b8f5a" } };
const HERO = { id: "hero", kind: "box", pos: [0, 2, 0], size: [4, 4, 4], material: { color: "#d8a070" } };
const TREE = { id: "tree", kind: "cone", pos: [10, 2, 0], size: [1.5, 4], material: { color: "#2f6b3a" } };
const SIGN = { id: "sign", kind: "sphere", pos: [-10, 1, 0], size: [1], material: { color: "#aa3333" } };
const shot = (id: string, from: number[], to: number[], extra: Record<string, unknown> = {}) => ({
  id, name: id, duration_ms: 3000, caption: `Caption ${id}`, from: { pos: from, look: "hero" }, to: { pos: to, look: "hero" }, ...extra,
});
const film = (shots: unknown[], id = "tour"): Film => ({ id, name: id, shots }) as Film;
const GOOD_FILM = film([shot("a", [0, 5, 30], [10, 5, 22]), shot("b", [-20, 6, 15], [-14, 5, 10], { focus: "sign" }), shot("c", [14, 4, 10], [14, 4, 4], { focus: "tree" })]);
const kinds = (r: ReturnType<typeof reviewScene>) => r.issues.map((i) => i.kind).sort();
const issue = (r: ReturnType<typeof reviewScene>, kind: string) => r.issues.find((i) => i.kind === kind);

test("a complete, lit, composed scene scores at least 90 and is ok", () => {
  const r = reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN]), films: [GOOD_FILM] });
  assert.deepEqual(r.issues, []);
  assert.equal(r.ok, true);
  assert.equal(r.score, 100);
  assert.deepEqual([r.stats.objects, r.stats.lights, r.stats.colors, r.stats.films, r.stats.shots, r.stats.duration_ms, r.stats.unshown, r.stats.captioned_shots], [4, 2, 4, 1, 3, 9000, 0, 3]);
});

test("validate_scene issues are reused: errors cost 15, warnings 6", () => {
  const bad = reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN]), films: [film([shot("a", [1, 1, 1], [10, 5, 22]), shot("b", [-20, 6, 15], [-14, 5, 10])])] });
  assert.equal(issue(bad, "camera_inside_solid")?.severity, "error");
  assert.equal(bad.ok, false);
  const noLights = reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN], { lights: [] }), films: [GOOD_FILM] });
  assert.deepEqual([kinds(noLights), noLights.score, noLights.ok], [["no_lights"], 94, false]);
  const short = reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN]), films: [film([shot("a", [0, 5, 30], [10, 5, 22], { duration_ms: 1000 }), shot("b", [-20, 6, 15], [-14, 5, 10], { duration_ms: 1000 })])] });
  assert.ok(kinds(short).includes("film_too_short"));
});

test("unseen_object: an object behind the camera and outside every look-at is reported, a focus or look-at covers it", () => {
  const behind = { id: "behind", kind: "box", pos: [0, 2, 200], size: [2, 2, 2], material: { color: "#222288" } };
  const r = reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN, behind]), films: [GOOD_FILM] });
  assert.deepEqual(kinds(r), ["unseen_object"]);
  const i = issue(r, "unseen_object")!;
  assert.deepEqual([i.severity, i.object], ["warning", "behind"]);
  assert.match(i.fix, /Aim a shot at "behind"/);
  assert.equal(r.stats.unshown, 1);
  const focus = film([shot("a", [0, 5, 30], [10, 5, 22], { focus: "behind" }), shot("b", [-20, 6, 15], [-14, 5, 10], { focus: "sign" }), shot("c", [14, 4, 10], [14, 4, 4], { focus: "tree" })]);
  assert.deepEqual(reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN, behind]), films: [focus] }).issues, []);
});

test("unseen_object: a group id in focus covers its children, repeater copies count once under their id", () => {
  const far = { id: "far", kind: "group", pos: [300, 0, 30], children: [{ id: "far-a", kind: "box", size: [2, 2, 2], material: { color: "#884422" } }] };
  const rep = { id: "row", kind: "repeat", pos: [0, 0, 300], repeat: { mode: "grid", count: 3, spacing: 4, of: { id: "post", kind: "box", pos: [0, 1, 0], size: [1, 2, 1], material: { color: "#556677" } } } };
  const base = [GROUND, HERO, TREE, SIGN, far, rep];
  const r = reviewScene({ scene: mk(base), films: [GOOD_FILM] });
  assert.deepEqual(r.issues.filter((i) => i.kind === "unseen_object").map((i) => i.object).sort(), ["far-a", "post"]);
  const f = film([shot("a", [0, 5, 30], [10, 5, 22], { focus: "far" }), shot("b", [-20, 6, 15], [-14, 5, 10], { focus: "sign" }), shot("c", [14, 4, 10], [14, 4, 4], { focus: "post" })]);
  assert.deepEqual(reviewScene({ scene: mk(base), films: [f] }).issues, []);
});

test("unseen_object: an object inside the view cone mid-path counts as shown", () => {
  const mid = { id: "mid", kind: "box", pos: [0, 2, 15], size: [1, 1, 1], material: { color: "#aa22aa" } };
  const r = reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN, mid]), films: [GOOD_FILM] });
  assert.deepEqual(r.issues, []);
});

test("flat_palette: one material colour across 4+ objects; sky top equals bottom", () => {
  const grey = (id: string, x: number) => ({ id, kind: "box", pos: [x, 1, 0], size: [2, 2, 2], material: { color: "#888888" } });
  const r = reviewScene({ scene: mk([grey("hero", 0), grey("b", 6), grey("c", 10), grey("d", -10)]), films: [film([shot("a", [0, 5, 30], [4, 5, 22]), shot("b", [-20, 6, 15], [-14, 5, 10])])] });
  assert.equal(issue(r, "flat_palette")?.severity, "warning");
  assert.match(issue(r, "flat_palette")!.fix, /different material colours/);
  assert.equal(r.ok, false);
  const three = reviewScene({ scene: mk([grey("hero", 0), grey("b", 6), grey("c", 10)]), films: [] });
  assert.equal(issue(three, "flat_palette"), undefined);
  const sky = reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN], { sky: { top: "#AABBCC", bottom: "#aabbcc" } }), films: [GOOD_FILM] });
  assert.deepEqual([kinds(sky), sky.score], [["flat_sky"], 94]);
});

test("path_through_solid: a shot path through geometry between valid end points", () => {
  const through = film([shot("a", [-20, 2, 0], [20, 2, 0]), shot("b", [-20, 6, 15], [-14, 5, 10])]);
  const r = reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN]), films: [through] });
  const hits = r.issues.filter((i) => i.kind === "path_through_solid");
  assert.deepEqual(hits.map((i) => [i.severity, i.film, i.shot, i.object]).sort(), [["warning", "tour", 0, "hero"], ["warning", "tour", 0, "tree"]].sort());
  assert.match(hits[0].fix, /waypoint/);
  const around = film([shot("a", [-20, 2, 0], [20, 2, 0], { waypoints: [[0, 2, 12]] }), shot("b", [-20, 6, 15], [-14, 5, 10])]);
  assert.equal(issue(reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN]), films: [around] }), "path_through_solid"), undefined);
});

test("no_films is info with a fix, not a warning", () => {
  const r = reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN]), films: [] });
  assert.deepEqual(r.issues.map((i) => [i.kind, i.severity]), [["no_films", "info"]]);
  assert.match(r.issues[0].fix, /2 to 4 films/);
  assert.deepEqual([r.ok, r.score], [true, 99]);
  assert.deepEqual(reviewScene({ scene: mk([]), films: [] }).issues.map((i) => i.kind), ["empty_scene"]);
});

test("missing_caption is info per shot", () => {
  const f = film([shot("a", [0, 5, 30], [10, 5, 22], { caption: undefined }), shot("b", [-20, 6, 15], [-14, 5, 10], { caption: "" }), shot("c", [14, 4, 10], [14, 4, 4])]);
  const r = reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN]), films: [f] });
  assert.deepEqual(r.issues.filter((i) => i.kind === "missing_caption").map((i) => [i.severity, i.shot]), [["info", 0], ["info", 1]]);
  assert.equal(r.ok, true);
  assert.equal(r.stats.captioned_shots, 1);
});

test("thin_film is a warning for a single-shot film", () => {
  const r = reviewScene({ scene: mk([GROUND, HERO, TREE, SIGN]), films: [GOOD_FILM, film([shot("a", [0, 5, 30], [10, 5, 22], { duration_ms: 6000 })], "one")] });
  const i = issue(r, "thin_film")!;
  assert.deepEqual([i.severity, i.film], ["warning", "one"]);
  assert.equal(r.ok, false);
});

test("static_shot is info: from equals to with no waypoints; a waypoint or a different look makes it move", () => {
  const still = shot("s", [0, 5, 30], [0, 5, 30]);
  const base = [GROUND, HERO, TREE, SIGN];
  const r = reviewScene({ scene: mk(base), films: [film([still, shot("b", [-20, 6, 15], [-14, 5, 10])])] });
  assert.deepEqual(r.issues.map((i) => [i.kind, i.severity, i.shot]), [["static_shot", "info", 0]]);
  assert.equal(r.ok, true);
  const moving = reviewScene({ scene: mk(base), films: [film([{ ...still, waypoints: [[2, 5, 30]] }, { ...still, to: { pos: [0, 5, 30], look: "tree" } }])] });
  assert.equal(issue(moving, "static_shot"), undefined);
});

test("score is 100 minus 15 per error, 6 per warning, 1 per info, never below 0", () => {
  const dark = mk([HERO], { lights: [], sky: { top: "#111111", bottom: "#111111" } });
  const many = film([shot("a", [1, 1, 1], [1, 1, 1], { caption: undefined })]);
  const r = reviewScene({ scene: dark, films: [many] });
  const sev = (s: string) => r.issues.filter((i) => i.severity === s).length;
  assert.equal(r.score, 100 - 15 * sev("error") - 6 * sev("warning") - sev("info"));
  assert.ok(sev("error") >= 1 && sev("warning") >= 3 && sev("info") >= 2);
  const wreck = film(Array.from({ length: 12 }, (_, n) => shot(`s${n}`, [1, 1, 1], [1, 1, 1])));
  assert.equal(reviewScene({ scene: dark, films: [wreck] }).score, 0);
});

test("review_scene end to end through the store", () => {
  const sql = nodeSql();
  migrate(sql);
  openProject(sql, { name: "tvdash", manifest: { tree: [], files: {} } }, 1);
  createScene(sql, "tvdash", { name: "Yard" }, 2);
  const scene = { name: "Yard", objects: [GROUND, HERO, TREE, SIGN], lights: [SUN, AIR], sky: { top: "#2c4a7a", bottom: "#f0b27a" }, camera: { pos: [0, 6, 30], look: "hero", fov: 50 } };
  setScene(sql, "tvdash", "yard", { ...scene, lights: [] }, 3);
  const first = reviewStoredScene(sql, "tvdash", "yard");
  assert.deepEqual([first.scene, first.ok, kinds(first as any)], ["yard", false, ["no_films", "no_lights"]]);
  setScene(sql, "tvdash", "yard", scene, 4);
  setFilms(sql, "tvdash", "yard", [GOOD_FILM], 5);
  const done = reviewStoredScene(sql, "tvdash", "yard");
  assert.deepEqual([done.ok, done.score, done.issues], [true, 100, []]);
  assert.throws(() => reviewStoredScene(sql, "tvdash", "nope"), /unknown scene "nope"/);
});

test("the tool description tells Claude to loop until ok and score >= 90", () => {
  assert.match(SCENE_TEXT.review_scene, /ok is true and score >= 90/);
  assert.match(SCENE_TEXT.review_scene, /after validate_scene/);
  assert.match(SCENE_TEXT.review_scene, /fix every issue before you show anything/);
  assert.match(SCENE_TEXT.validate_scene, /review_scene/);
});
