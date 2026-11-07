// Scenes as pure functions over `Sql` (docs/scenes.md). The only code that touches the `scenes` table. Every write checks the whole
// input first, then stores it with its event in one transaction. Events never carry a scene body or films.
import { checkId, requireProject } from "./canvases.ts";
import { checkPage, type Page } from "./page-model.ts";
import { slugify } from "./projects.ts";
import { checkScene, expandedCount, type Scene, type SceneObject } from "./scene.ts";
import { reviewScene } from "./scene-review.ts";
import { validateScene } from "./scene-validate.ts";
import { checkFilms, readFilms, type Film, type FilmRead } from "./shots.ts";
import { appendEvent, type LiteEvent, type Sql } from "./store.ts";

/** objects: declared top-level objects; drawables: nodes after repeaters expand (groups and copies included, the 2000 limit). */
export type SceneSummary = { id: string; name: string; objects: number; drawables: number; films: number; updated_at: number };
export type SceneEdit = { op: "set" | "remove"; id: string; object?: SceneObject };

/** The MCP tool descriptions (docs/scenes.md). */
export const SCENE_TEXT = {
  create_scene: "Create an empty 3D scene (a sky and a camera, no lights or objects) in a project; id defaults to the slug of the name. A scene is data, never code: you describe objects, lights, a sky and a camera as JSON and nothing you write runs. Next: set_scene with objects, lights and a sky, then set_films. Answer {scene: {id, name, objects, drawables, films, updated_at}} (objects: top-level objects; drawables: objects after repeaters expand). An existing id is an error.",
  set_scene: "Replace a whole scene with data {name, objects, lights, sky, camera}. If the project has a design system (get_design_system), read it first and take colors from its tokens. A scene is data, never code. Build lights (a sun and an ambient light) and a sky, not just objects. Every object has a slug id: box, sphere, cylinder, cone, plane, torus, capsule, text, terrain, group (children) and repeat (grid, ring or scatter copies of one template), at most 2000 after repeaters expand, 200000 bytes, nesting 6. The whole input is checked first and an error names the path of the bad value; nothing is stored then. Films stay. Answer {scene: summary}.",
  patch_scene: "Edit a scene's objects by id without resending it: edits [{op: 'set' or 'remove', id, object?}] (1 to 50), applied in order to top-level or nested objects. set replaces the object with that id (also a repeater's template), or adds a new top-level object when the id does not exist (object.id must equal id); remove needs an existing id. The whole scene is re-checked and nothing is stored if it is invalid. Removing an object a film's shot points at succeeds: read_scene lists those shots under missing. Answer {scene: summary}.",
  set_films: "Replace all films of a scene (0 to 8; empty clears). A film is {id, name, description?, shots:[{id, name, from:{pos, look}, to:{pos, look}, duration_ms 500 to 60000, waypoints?, ease?, caption?, focus?}]}; look is a [x, y, z] point or an object id; focus must be an object id. WRITE 2 TO 4 FILMS for every scene and give every shot a caption in plain words that says what the viewer sees (no jargon, no ids). Answer {scene, count}.",
  read_scene: "Read a scene and its films: {scene, films, updated_at}. Each film has duration_ms and missing: the indexes of shots whose focus or look-at object no longer exists. Use it to find object ids before patch_scene or set_films.",
  list_scenes: "List a project's scenes, newest updated first: {scenes:[{id, name, objects, drawables, films, updated_at}]}; objects counts top-level objects, drawables the objects after repeaters expand (limit 2000).",
  validate_scene: "Review a scene and its films like a director. Answer {ok, issues:[{severity, kind, message, fix, object?, film?, shot?}]}: errors camera_inside_solid, shot_looks_at_nothing and focus_missing, warnings no_lights and film_too_short, info empty_scene. ALWAYS run it after set_scene and set_films and fix every issue (set_scene, patch_scene, set_films) before you show anything; ok means no errors. Then run review_scene.",
  review_scene: "Review a 3D scene like a director: is it composed, lit and filmed like a finished piece, not just valid? Answer {scene, score (0-100), ok, issues:[{severity, kind, message, fix, object?, film?, shot?}], stats}. It includes everything validate_scene reports, plus warnings unseen_object (no shot shows it), flat_palette (one material colour across 4+ objects), flat_sky, path_through_solid (the camera flies through geometry), thin_film (a single shot) and info no_films, missing_caption and static_shot. Run it after validate_scene, apply each issue's fix (set_scene, patch_scene, set_films) and run it again. Keep going until ok is true and score >= 90, and fix every issue before you show anything; never present a half-finished scene.",
  set_page: "Set the scrolling web page of a scene (the 3D landing page): page {sections: [{id, title?, html, shot, align?, height_vh?, gap_vh?}]}, 1 to 12 sections; null or {} clears it. Write the sections like a landing page: a headline first, then ONE idea per section, each bound to a shot (shot: a shot id of a film, or a pair [first, second] that moves the camera from the first shot's start view to the second shot's end view). html is the overlay shown over the 3D view in a sandboxed frame: text and markup only, no <script>, no on* attributes, no javascript: urls, no iframe, object, embed or form; at most 20000 bytes a section and 100000 a page; title at most 80 characters; align left, right or center; height_vh 50 to 300 is the scroll length (default 100); gap_vh 0 to 100 holds the camera on the previous end view before the section. Run validate_scene and review_scene first and fix what they say. Answer {scene, sections}.",
} as const;

type Row = { id: string; name: string; data: string; films: string; page: string; updated_at: number };

const byteLength = (s: string) => new TextEncoder().encode(s).length;

function requireScene(sql: Sql, project: string, id: string): Row {
  requireProject(sql, project);
  checkId("scene", id);
  const [r] = sql.all<Row>("SELECT id, name, data, films, page, updated_at FROM scenes WHERE project = ? AND id = ? AND removed = 0", project, id);
  if (!r) throw new Error(`unknown scene "${id}"`);
  return r;
}

const summary = (id: string, scene: Scene, films: unknown[], updated_at: number): SceneSummary => ({
  id, name: scene.name, objects: scene.objects.length, drawables: expandedCount(scene.objects), films: films.length, updated_at,
});

function load(sql: Sql, project: string, id: string): { scene: Scene; films: Film[]; page: Page | null; updated_at: number } {
  const r = requireScene(sql, project, id);
  return { scene: JSON.parse(r.data), films: JSON.parse(r.films), page: JSON.parse(r.page), updated_at: r.updated_at };
}

function store(sql: Sql, project: string, id: string, scene: Scene, now: number): LiteEvent {
  const data = JSON.stringify(scene);
  sql.run("UPDATE scenes SET name = ?, data = ?, updated_at = ? WHERE project = ? AND id = ?", scene.name, data, now, project, id);
  return appendEvent(sql, { project, kind: "scene.set", payload: { scene: id, name: scene.name, bytes: byteLength(data) } }, now);
}

/** A new scene with a sky and a camera and nothing else (add lights and objects with set_scene or patch_scene). An existing id is an error. */
export function createScene(
  sql: Sql, project: string, input: { id?: string; name: string }, now = Date.now(),
): { scene: SceneSummary; event: LiteEvent } {
  requireProject(sql, project);
  const scene = checkScene({
    name: input?.name, objects: [], lights: [],
    sky: { top: "#2c4a7a", bottom: "#f0b27a" }, camera: { pos: [0, 5, 20], look: [0, 0, 0], fov: 50 },
  });
  const id = checkId("scene", input.id ?? slugify(scene.name));
  return sql.transaction(() => {
    if (sql.all("SELECT 1 FROM scenes WHERE project = ? AND id = ? AND removed = 0", project, id).length)
      throw new Error(`scene "${id}" already exists: use set_scene or patch_scene`);
    const data = JSON.stringify(scene);
    // A removed row with this id is revived in place (its data and films replaced), never deleted.
    sql.run(
      `INSERT INTO scenes (project, id, name, data, films, updated_at, removed) VALUES (?, ?, ?, ?, '[]', ?, 0)
       ON CONFLICT (project, id) DO UPDATE SET name = excluded.name, data = excluded.data, films = '[]', page = 'null', updated_at = excluded.updated_at, removed = 0`,
      project, id, scene.name, data, now,
    );
    const event = appendEvent(sql, { project, kind: "scene.set", payload: { scene: id, name: scene.name, bytes: byteLength(data) } }, now);
    return { scene: summary(id, scene, [], now), event };
  });
}

/** Replaces the whole scene. Films stay; read_scene's `missing` shows shots that now point at nothing. */
export function setScene(sql: Sql, project: string, id: string, input: unknown, now = Date.now()): { scene: SceneSummary; event: LiteEvent } {
  requireScene(sql, project, id);
  const scene = checkScene(input);
  return sql.transaction(() => {
    const films = JSON.parse(requireScene(sql, project, id).films) as unknown[];
    return { scene: summary(id, scene, films, now), event: store(sql, project, id, scene, now) };
  });
}

/** Where an object with that id sits: in a list (top-level or a group's children) or as a repeater's template (`repeat.of`). */
type Found = { list: SceneObject[]; index: number } | { repeater: SceneObject };

function find(objects: SceneObject[], id: string): Found | null {
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    if (o.id === id) return { list: objects, index: i };
    const inner = find(o.children ?? [], id);
    if (inner) return inner;
    if (o.repeat) {
      if (o.repeat.of.id === id) return { repeater: o };
      const t = find([o.repeat.of], id);
      if (t) return t;
    }
  }
  return null;
}

/** Edits objects by id (top-level or nested), then re-checks the whole scene. `set` replaces the object with that id, or appends a new top-level object when the id is not in the scene. `remove` needs an existing id. Nothing is stored if the result is invalid. */
export function patchScene(
  sql: Sql, project: string, id: string, edits: SceneEdit[], now = Date.now(),
): { scene: SceneSummary; event: LiteEvent } {
  if (!Array.isArray(edits) || edits.length < 1 || edits.length > 50) throw new Error("invalid edits: use 1 to 50 edits");
  return sql.transaction(() => {
    const cur = load(sql, project, id);
    const scene: Scene = structuredClone(cur.scene);
    edits.forEach((e, i) => {
      if (typeof e !== "object" || e === null || (e.op !== "set" && e.op !== "remove") || typeof e.id !== "string") throw new Error(`invalid edit ${i}: must be {op: "set"|"remove", id, object?}`);
      const hit = find(scene.objects, e.id);
      if (e.op === "remove") {
        if (!hit) throw new Error(`invalid edit ${i}: unknown object "${e.id}": use an id from read_scene`);
        if ("repeater" in hit)
          throw new Error(`invalid edit ${i}: cannot remove the repeater template "${e.id}" of "${hit.repeater.id}": set it to a new template, or remove the repeater "${hit.repeater.id}"`);
        hit.list.splice(hit.index, 1);
        return;
      }
      if (typeof e.object !== "object" || e.object === null) throw new Error(`invalid edit ${i}: set needs an object`);
      if (hit && "repeater" in hit) hit.repeater.repeat!.of = e.object;
      else if (hit) hit.list[hit.index] = e.object;
      else if ((e.object as SceneObject).id === e.id) scene.objects.push(e.object);
      else throw new Error(`invalid edit ${i}: unknown object "${e.id}": to add one, give object.id the same id`);
    });
    const checked = checkScene(scene);
    return { scene: summary(id, checked, cur.films, now), event: store(sql, project, id, checked, now) };
  });
}

/** Replaces all films (checked against the stored scene). Empty array clears them. */
export function setFilms(sql: Sql, project: string, id: string, films: unknown, now = Date.now()): { result: { scene: string; count: number }; event: LiteEvent } {
  return sql.transaction(() => {
    const { scene } = load(sql, project, id);
    const checked = checkFilms(films, scene);
    sql.run("UPDATE scenes SET films = ?, updated_at = ? WHERE project = ? AND id = ?", JSON.stringify(checked), now, project, id);
    const event = appendEvent(sql, { project, kind: "films.set", payload: { scene: id, count: checked.length } }, now);
    return { result: { scene: id, count: checked.length }, event };
  });
}

/** Replaces the page (checked against the stored scene and films). null, `{}` or no sections clears it. The event carries the section count only, never html. */
export function setPage(sql: Sql, project: string, id: string, input: unknown, now = Date.now()): { result: { scene: string; sections: number }; event: LiteEvent } {
  return sql.transaction(() => {
    const { scene, films } = load(sql, project, id);
    const empty = input === null || input === undefined || (typeof input === "object" && !Array.isArray(input) && (Object.keys(input).length === 0 || (Array.isArray((input as any).sections) && (input as any).sections.length === 0)));
    const page = empty ? null : checkPage(input, scene, films);
    const sections = page ? page.sections.length : 0;
    sql.run("UPDATE scenes SET page = ?, updated_at = ? WHERE project = ? AND id = ?", JSON.stringify(page), now, project, id);
    const event = appendEvent(sql, { project, kind: "page.set", payload: { scene: id, sections } }, now);
    return { result: { scene: id, sections }, event };
  });
}

/** The scene with its films (each with duration and `missing`). Never throws for shots whose object is gone. */
export function readScene(sql: Sql, project: string, id: string): { scene: Scene; films: FilmRead[]; page: Page | null; updated_at: number } {
  const { scene, films, page, updated_at } = load(sql, project, id);
  return { scene, films: readFilms(films, scene), page, updated_at };
}

/** validate_scene on the stored scene and films. */
export function validateStoredScene(sql: Sql, project: string, id: string) {
  const { scene, films } = load(sql, project, id);
  return validateScene(scene, films);
}

/** review_scene on the stored scene and films: {scene, score, ok, issues, stats}. */
export function reviewStoredScene(sql: Sql, project: string, id: string) {
  const { scene, films } = load(sql, project, id);
  return { scene: id, ...reviewScene({ scene, films }) };
}

/** Live scenes, newest updated first. */
export function listScenes(sql: Sql, project: string): SceneSummary[] {
  requireProject(sql, project);
  return sql
    .all<Row>("SELECT id, name, data, films, updated_at FROM scenes WHERE project = ? AND removed = 0 ORDER BY updated_at DESC, id", project)
    .map((r) => summary(r.id, JSON.parse(r.data), JSON.parse(r.films), r.updated_at));
}
