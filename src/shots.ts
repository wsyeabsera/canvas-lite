// Films (docs/scenes.md): a film is a named list of shots; a shot flies the camera from one view to another.
// Pure: validation against the scene. Objects a shot points at may vanish later (patch_scene): readFilms reports them under `missing`.
import { objectIds, SCENE_NAME_MAX, SCENE_NUMBER_MAX, type Scene, type Vec3, type View } from "./scene.ts";

export type Shot = {
  id: string; name: string; from: View; to: View; waypoints?: Vec3[]; duration_ms: number;
  ease?: "linear" | "in-out" | "out"; caption?: string; focus?: string;
};
export type Film = { id: string; name: string; description?: string; shots: Shot[] };
export type FilmRead = Film & { duration_ms: number; missing: number[] };

export const FILMS_MAX = 8;
export const SHOTS_MAX = 30;
export const WAYPOINTS_MAX = 8;
export const SHOT_MS_MIN = 500;
export const SHOT_MS_MAX = 60_000;
export const FILM_DESCRIPTION_MAX = 200;
export const SHOT_CAPTION_MAX = 200;

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const EASES = ["linear", "in-out", "out"];
const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);

function slug(v: unknown, at: string, what: string): string {
  if (typeof v !== "string" || v.length > 40 || !ID_RE.test(v)) throw new Error(`${at}: ${what} ${JSON.stringify(v)} must be lowercase letters, digits and -, at most 40`);
  return v;
}
function vec3(v: unknown, at: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) throw new Error(`${at}: must be [x, y, z]`);
  return v.map((n, i) => {
    if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > SCENE_NUMBER_MAX) throw new Error(`${at}[${i}]: must be a finite number up to ${SCENE_NUMBER_MAX}, got ${String(n)}`);
    return n;
  }) as Vec3;
}
function name(v: unknown, at: string): string {
  if (typeof v !== "string" || v.trim() === "" || v.length > SCENE_NAME_MAX) throw new Error(`${at}: name must be 1 to ${SCENE_NAME_MAX} characters`);
  return v;
}
function view(v: unknown, at: string, ids: Set<string>): View {
  if (!isObj(v)) throw new Error(`${at}: must be an object {pos, look}`);
  const pos = vec3(v.pos, `${at}.pos`);
  if (typeof v.look === "string") {
    if (!ids.has(v.look)) throw new Error(`${at}.look: unknown object id "${v.look}": use an id from read_scene`);
    return { pos, look: v.look };
  }
  return { pos, look: vec3(v.look, `${at}.look`) };
}

/** Pure: films -> a validated copy. Throws naming `film "<id>" shot <n>`. Empty array allowed (clears). */
export function checkFilms(input: unknown, scene: Scene): Film[] {
  if (!Array.isArray(input) || input.length > FILMS_MAX) throw new Error(`invalid films: use 0 to ${FILMS_MAX} films`);
  const ids = objectIds(scene);
  const seen = new Set<string>();
  return input.map((f, i) => {
    if (!isObj(f)) throw new Error(`invalid film ${i}: must be an object {id, name, shots}`);
    const id = slug(f.id, `invalid film ${i}`, "id");
    if (seen.has(id)) throw new Error(`invalid film ${i}: duplicate id "${id}"`);
    seen.add(id);
    const film = `film "${id}"`;
    const out: Film = { id, name: name(f.name, `invalid ${film}`), shots: [] };
    if (f.description !== undefined && f.description !== "") {
      if (typeof f.description !== "string" || f.description.length > FILM_DESCRIPTION_MAX)
        throw new Error(`invalid ${film}: description must be text of at most ${FILM_DESCRIPTION_MAX} characters`);
      out.description = f.description;
    }
    if (!Array.isArray(f.shots) || f.shots.length < 1 || f.shots.length > SHOTS_MAX) throw new Error(`invalid ${film}: use 1 to ${SHOTS_MAX} shots`);
    const shotIds = new Set<string>();
    out.shots = f.shots.map((s: unknown, n: number): Shot => {
      const at = `invalid ${film} shot ${n}`;
      if (!isObj(s)) throw new Error(`${at}: must be an object {id, name, from, to, duration_ms}`);
      const sid = slug(s.id, at, "id");
      if (shotIds.has(sid)) throw new Error(`${at}: duplicate id "${sid}"`);
      shotIds.add(sid);
      const shot: Shot = {
        id: sid, name: name(s.name, at),
        from: view(s.from, `${at} from`, ids), to: view(s.to, `${at} to`, ids),
        duration_ms: 0,
      };
      if (!Number.isSafeInteger(s.duration_ms) || s.duration_ms < SHOT_MS_MIN || s.duration_ms > SHOT_MS_MAX)
        throw new Error(`${at}: duration_ms must be an integer from ${SHOT_MS_MIN} to ${SHOT_MS_MAX}`);
      shot.duration_ms = s.duration_ms;
      if (s.waypoints !== undefined) {
        if (!Array.isArray(s.waypoints) || s.waypoints.length > WAYPOINTS_MAX) throw new Error(`${at}: use at most ${WAYPOINTS_MAX} waypoints`);
        if (s.waypoints.length) shot.waypoints = s.waypoints.map((w: unknown, k: number) => vec3(w, `${at} waypoints[${k}]`));
      }
      if (s.ease !== undefined) {
        if (typeof s.ease !== "string" || !EASES.includes(s.ease)) throw new Error(`${at}: ease must be one of ${EASES.join(", ")}`);
        shot.ease = s.ease as Shot["ease"];
      }
      if (s.caption !== undefined && s.caption !== "") {
        if (typeof s.caption !== "string" || s.caption.length > SHOT_CAPTION_MAX) throw new Error(`${at}: caption must be text of at most ${SHOT_CAPTION_MAX} characters`);
        shot.caption = s.caption;
      }
      if (s.focus !== undefined && s.focus !== "") {
        if (typeof s.focus !== "string" || !ids.has(s.focus)) throw new Error(`${at}: unknown focus object "${String(s.focus)}": use an id from read_scene`);
        shot.focus = s.focus;
      }
      return shot;
    });
    return out;
  });
}

export const filmDuration = (shots: Shot[]): number => shots.reduce((t, s) => t + s.duration_ms, 0);

/** Pure: films with their duration and `missing` = shot indexes whose focus or look-at object no longer exists in the scene. Never throws. */
export function readFilms(films: Film[], scene: Scene): FilmRead[] {
  const ids = objectIds(scene);
  const gone = (id: unknown) => typeof id === "string" && !ids.has(id);
  return films.map((f) => ({
    ...f,
    duration_ms: filmDuration(f.shots),
    missing: f.shots.flatMap((s, i) => (gone(s.focus) || gone(s.from.look) || gone(s.to.look) ? [i] : [])),
  }));
}
