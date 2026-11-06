// validate_scene (docs/scenes.md): review a scene and its films like a director. Pure; every issue has a fix.
import { expandObjects, objectIds, type Scene, type SceneObject, type Vec3 } from "./scene.ts";
import { filmDuration, type Film } from "./shots.ts";

export type SceneIssue = {
  severity: "error" | "warning" | "info"; kind: string; message: string; fix: string; object?: string; film?: string; shot?: number;
};

export const FILM_MIN_MS = 3000;

type Box = { id: string; min: Vec3; max: Vec3 };

/** Half extents of a solid, ignoring rotation; size layout per kind is SIZE_LAYOUT in scene.ts (docs/scenes.md). Others are not solid. Missing size = 1. */
function halfExtents(o: SceneObject): Vec3 | null {
  const s = o.size ?? [];
  const k = o.scale ?? [1, 1, 1];
  let h: Vec3;
  if (o.kind === "box") h = [(s[0] ?? 1) / 2, (s[1] ?? 1) / 2, (s[2] ?? 1) / 2];
  else if (o.kind === "sphere") h = [s[0] ?? 1, s[0] ?? 1, s[0] ?? 1];
  else if (o.kind === "cylinder" || o.kind === "cone" || o.kind === "capsule") h = [s[0] ?? 1, (s[1] ?? 2) / 2, s[0] ?? 1];
  else if (o.kind === "torus") h = [(s[0] ?? 1) + (s[1] ?? 0.3), (s[1] ?? 0.3), (s[0] ?? 1) + (s[1] ?? 0.3)];
  else return null;
  return [h[0] * Math.abs(k[0]), h[1] * Math.abs(k[1]), h[2] * Math.abs(k[2])];
}

/** Boxes of the expanded scene; a group's pos is added to its children (summed, rotation and scale ignored). */
function boxes(objects: SceneObject[], off: Vec3 = [0, 0, 0], out: Box[] = []): Box[] {
  for (const o of objects) {
    const p = o.pos ?? [0, 0, 0];
    const at: Vec3 = [off[0] + p[0], off[1] + p[1], off[2] + p[2]];
    if (o.kind === "group") boxes(o.children ?? [], at, out);
    else {
      const h = halfExtents(o);
      if (h) out.push({ id: o.id, min: [at[0] - h[0], at[1] - h[1], at[2] - h[2]], max: [at[0] + h[0], at[1] + h[1], at[2] + h[2]] });
    }
  }
  return out;
}

const inside = (p: Vec3, b: Box) => p.every((v, i) => v > b.min[i] && v < b.max[i]);

/** Pure: errors block showing the scene; warnings and info do not. `ok` means no errors. */
export function validateScene(scene: Scene, films: Film[]): { ok: boolean; issues: SceneIssue[] } {
  const issues: SceneIssue[] = [];
  if (scene.objects.length === 0)
    issues.push({ severity: "info", kind: "empty_scene", message: "The scene has no objects (sky and lights only).", fix: "Add objects with patch_scene if you want something to look at; an empty scene is valid." });
  if (scene.lights.length === 0)
    issues.push({ severity: "warning", kind: "no_lights", message: "The scene has no lights, so objects render dark.", fix: "Add a sun and an ambient light with set_scene." });
  const solids = boxes(expandObjects(scene.objects));
  const ids = objectIds(scene);
  for (const f of films) {
    f.shots.forEach((s, n) => {
      for (const end of ["from", "to"] as const) {
        const v = s[end];
        const hit = solids.find((b) => inside(v.pos, b));
        if (hit)
          issues.push({ severity: "error", kind: "camera_inside_solid", film: f.id, shot: n, object: hit.id,
            message: `film "${f.id}" shot ${n}: the camera ${end} position [${v.pos.join(", ")}] is inside "${hit.id}".`,
            fix: `Move the ${end} position of shot ${n} outside "${hit.id}" (set_films).` });
        if (typeof v.look === "string" && !ids.has(v.look))
          issues.push({ severity: "error", kind: "shot_looks_at_nothing", film: f.id, shot: n, object: v.look,
            message: `film "${f.id}" shot ${n}: ${end}.look points at "${v.look}", which does not exist.`,
            fix: `Point ${end}.look at an existing object id or a [x, y, z] position (set_films).` });
      }
      if (s.focus !== undefined && !ids.has(s.focus))
        issues.push({ severity: "error", kind: "focus_missing", film: f.id, shot: n, object: s.focus,
          message: `film "${f.id}" shot ${n}: focus points at "${s.focus}", which does not exist.`,
          fix: `Set the focus of shot ${n} to an existing object id, or leave focus out (set_films).` });
    });
    if (filmDuration(f.shots) < FILM_MIN_MS)
      issues.push({ severity: "warning", kind: "film_too_short", film: f.id,
        message: `film "${f.id}" lasts ${filmDuration(f.shots)} ms, under ${FILM_MIN_MS} ms.`, fix: "Lengthen the shots or add one so the film is at least 3 seconds." });
  }
  return { ok: !issues.some((i) => i.severity === "error"), issues };
}
