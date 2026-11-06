// Scenes as pure functions over `Sql` (docs/scenes.md). The only code that touches the `scenes` table. Every write checks the whole
// input first, then stores it with its event in one transaction. Events never carry a scene body or films.
import { checkId, requireProject } from "./canvases.ts";
import { slugify } from "./projects.ts";
import { checkScene, type Scene, type SceneObject } from "./scene.ts";
import { validateScene } from "./scene-validate.ts";
import { checkFilms, readFilms, type Film, type FilmRead } from "./shots.ts";
import { appendEvent, type LiteEvent, type Sql } from "./store.ts";

export type SceneSummary = { id: string; name: string; objects: number; films: number; updated_at: number };
export type SceneEdit = { op: "set" | "remove"; id: string; object?: SceneObject };

/** The MCP tool descriptions (docs/scenes.md). */
export const SCENE_TEXT = {
  create_scene: "Create an empty 3D scene (a sky and a camera, no lights or objects) in a project; id defaults to the slug of the name. A scene is data, never code: you describe objects, lights, a sky and a camera as JSON and nothing you write runs. Next: set_scene with objects, lights and a sky, then set_films. Answer {scene: {id, name, objects, films, updated_at}}. An existing id is an error.",
  set_scene: "Replace a whole scene with data {name, objects, lights, sky, camera}. A scene is data, never code. Build lights (a sun and an ambient light) and a sky, not just objects. Every object has a slug id: box, sphere, cylinder, cone, plane, torus, capsule, text, terrain, group (children) and repeat (grid, ring or scatter copies of one template), at most 2000 after repeaters expand, 200000 bytes, nesting 6. The whole input is checked first and an error names the path of the bad value; nothing is stored then. Films stay. Answer {scene: summary}.",
  patch_scene: "Edit a scene's objects by id without resending it: edits [{op: 'set' or 'remove', id, object?}] (1 to 50), applied in order to top-level or nested objects. set replaces the object with that id, or adds a new top-level object when the id does not exist (object.id must equal id); remove needs an existing id. The whole scene is re-checked and nothing is stored if it is invalid. Removing an object a film's shot points at succeeds: read_scene lists those shots under missing. Answer {scene: summary}.",
  set_films: "Replace all films of a scene (0 to 8; empty clears). A film is {id, name, description?, shots:[{id, name, from:{pos, look}, to:{pos, look}, duration_ms 500 to 60000, waypoints?, ease?, caption?, focus?}]}; look is a [x, y, z] point or an object id; focus must be an object id. WRITE 2 TO 4 FILMS for every scene and give every shot a caption in plain words that says what the viewer sees (no jargon, no ids). Answer {scene, count}.",
  read_scene: "Read a scene and its films: {scene, films, updated_at}. Each film has duration_ms and missing: the indexes of shots whose focus or look-at object no longer exists. Use it to find object ids before patch_scene or set_films.",
  list_scenes: "List a project's scenes, newest updated first: {scenes:[{id, name, objects, films, updated_at}]}.",
  validate_scene: "Review a scene and its films like a director. Answer {ok, issues:[{severity, kind, message, fix, object?, film?, shot?}]}: errors camera_inside_solid and shot_looks_at_nothing, warnings no_lights and film_too_short, info empty_scene. ALWAYS run it after set_scene and set_films and fix every issue (set_scene, patch_scene, set_films) before you show anything; ok means no errors.",
} as const;

type Row = { id: string; name: string; data: string; films: string; updated_at: number };

const byteLength = (s: string) => new TextEncoder().encode(s).length;

function requireScene(sql: Sql, project: string, id: string): Row {
  requireProject(sql, project);
  checkId("scene", id);
  const [r] = sql.all<Row>("SELECT id, name, data, films, updated_at FROM scenes WHERE project = ? AND id = ? AND removed = 0", project, id);
  if (!r) throw new Error(`unknown scene "${id}"`);
  return r;
}

const summary = (id: string, scene: Scene, films: unknown[], updated_at: number): SceneSummary => ({ id, name: scene.name, objects: scene.objects.length, films: films.length, updated_at });

function load(sql: Sql, project: string, id: string): { scene: Scene; films: Film[]; updated_at: number } {
  const r = requireScene(sql, project, id);
  return { scene: JSON.parse(r.data), films: JSON.parse(r.films), updated_at: r.updated_at };
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
    sql.run("DELETE FROM scenes WHERE project = ? AND id = ? AND removed = 1", project, id);
    const data = JSON.stringify(scene);
    sql.run("INSERT INTO scenes (project, id, name, data, films, updated_at) VALUES (?, ?, ?, ?, '[]', ?)", project, id, scene.name, data, now);
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

type Found = { list: SceneObject[]; index: number };

function find(objects: SceneObject[], id: string): Found | null {
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    if (o.id === id) return { list: objects, index: i };
    const inner = find(o.children ?? [], id);
    if (inner) return inner;
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
        hit.list.splice(hit.index, 1);
        return;
      }
      if (typeof e.object !== "object" || e.object === null) throw new Error(`invalid edit ${i}: set needs an object`);
      if (hit) hit.list[hit.index] = e.object;
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

/** The scene with its films (each with duration and `missing`). Never throws for shots whose object is gone. */
export function readScene(sql: Sql, project: string, id: string): { scene: Scene; films: FilmRead[]; updated_at: number } {
  const { scene, films, updated_at } = load(sql, project, id);
  return { scene, films: readFilms(films, scene), updated_at };
}

/** validate_scene on the stored scene and films. */
export function validateStoredScene(sql: Sql, project: string, id: string) {
  const { scene, films } = load(sql, project, id);
  return validateScene(scene, films);
}

/** Live scenes, newest updated first. */
export function listScenes(sql: Sql, project: string): SceneSummary[] {
  requireProject(sql, project);
  return sql
    .all<Row>("SELECT id, name, data, films, updated_at FROM scenes WHERE project = ? AND removed = 0 ORDER BY updated_at DESC, id", project)
    .map((r) => summary(r.id, JSON.parse(r.data), JSON.parse(r.films), r.updated_at));
}
