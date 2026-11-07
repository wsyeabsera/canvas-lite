// review_scene (docs/scenes.md): is the scene composed, lit and filmed like a finished piece, not just valid? Pure; every issue has a fix.
// It reuses validateScene's issues and adds approximate checks: bounding spheres against the camera cone, sampled along each shot path.
import { expandObjects, type Scene, type SceneObject, type Vec3 } from "./scene.ts";
import { boxes, inside, validateScene, type SceneIssue } from "./scene-validate.ts";
import { filmDuration, type Film, type Shot } from "./shots.ts";

export type SceneReview = {
  score: number; ok: boolean; issues: SceneIssue[];
  stats: {
    objects: number; lights: number; colors: number; films: number; shots: number; duration_ms: number;
    shown: number; unshown: number; captioned_shots: number;
  };
};

/** Aspect ratio assumed for the horizontal field of view (the watch page is a desktop 16:9 viewer). */
export const REVIEW_ASPECT = 16 / 9;
const VIEW_SAMPLES = 8;
const PATH_SAMPLES = 24;

type Node = { id: string; base: string; pos: Vec3; radius: number; ancestors: string[]; color?: string; leaf: boolean };

const baseId = (id: string) => id.split("#")[0];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const same = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Radius of a sphere around the object (scale applied, rotation ignored). Missing size takes the same defaults as validateScene. */
function radius(o: SceneObject): number {
  const s = o.size ?? [];
  const k = Math.max(...(o.scale ?? [1, 1, 1]).map(Math.abs));
  let r: number;
  switch (o.kind) {
    case "box": r = Math.hypot(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1) / 2; break;
    case "sphere": r = s[0] ?? 1; break;
    case "cylinder": case "cone": case "capsule": r = Math.hypot(s[0] ?? 1, (s[1] ?? 2) / 2); break;
    case "torus": r = (s[0] ?? 1) + (s[1] ?? 0.3); break;
    case "plane": r = Math.hypot(s[0] ?? 1, s[1] ?? 1) / 2; break;
    case "text": r = ((s[0] ?? 1) * Math.max(1, (o.text ?? "").length * 0.3)) / 2; break;
    case "terrain": r = o.terrain ? Math.hypot(o.terrain.size[0], o.terrain.size[1]) / 2 + o.terrain.height : 1; break;
    default: r = 1;
  }
  return r * k;
}

/** Every node of the expanded scene with its summed world position (group offsets added, rotation and scale of groups ignored). */
function nodes(objects: SceneObject[], off: Vec3 = [0, 0, 0], ancestors: string[] = [], out: Node[] = []): Node[] {
  for (const o of objects) {
    const pos = add(off, o.pos ?? [0, 0, 0]);
    if (o.kind === "group") {
      out.push({ id: o.id, base: baseId(o.id), pos, radius: 0, ancestors, leaf: false });
      nodes(o.children ?? [], pos, [...ancestors, baseId(o.id)], out);
    } else if (o.kind !== "repeat") {
      out.push({ id: o.id, base: baseId(o.id), pos, radius: radius(o), ancestors, color: (o.material?.color ?? "default").toLowerCase(), leaf: true });
    }
  }
  return out;
}

/** The camera path of a shot: from.pos, the waypoints, to.pos (straight segments), at t in [0, 1] by arc length. */
function pathAt(s: Shot, t: number): Vec3 {
  const pts = [s.from.pos, ...(s.waypoints ?? []), s.to.pos];
  const segs = pts.slice(1).map((p, i) => len(sub(p, pts[i])));
  const total = segs.reduce((a, b) => a + b, 0);
  if (total === 0) return pts[0];
  let d = t * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) return lerp(pts[i], pts[i + 1], segs[i] === 0 ? 0 : Math.min(1, d / segs[i]));
    d -= segs[i];
  }
  return pts[pts.length - 1];
}

const samePoint = (a: Shot["from"]["look"], b: Shot["from"]["look"]) =>
  typeof a === "string" || typeof b === "string" ? a === b : same(a, b);

/** Pure: score 0 to 100 (100 minus 15 per error, 6 per warning, 1 per info), `ok` = no errors and no warnings. */
export function reviewScene(input: { scene: Scene; films: Film[] }): SceneReview {
  const { scene, films } = input;
  const issues: SceneIssue[] = [...validateScene(scene, films).issues];
  const all = nodes(expandObjects(scene.objects));
  const leaves = all.filter((n) => n.leaf);
  const byBase = new Map<string, Node>();
  for (const n of all) if (!byBase.has(n.base)) byBase.set(n.base, n);
  const shots = films.flatMap((f) => f.shots.map((s, n) => ({ f, s, n })));

  // Objects no shot ever shows.
  const shown = new Set<string>();
  const covered = new Set<string>();
  const half = Math.atan(Math.tan((scene.camera.fov * Math.PI) / 360) * REVIEW_ASPECT);
  const lookPoint = (v: Shot["from"]["look"]): Vec3 => (typeof v === "string" ? (byBase.get(v)?.pos ?? [0, 0, 0]) : v);
  for (const { s } of shots) {
    for (const id of [s.focus, s.from.look, s.to.look]) if (typeof id === "string") covered.add(id);
    for (let i = 0; i <= VIEW_SAMPLES; i++) {
      const t = i / VIEW_SAMPLES;
      const cam = pathAt(s, t);
      const fwd = sub(lerp(lookPoint(s.from.look), lookPoint(s.to.look), t), cam);
      const fl = len(fwd);
      if (fl === 0) continue;
      for (const n of leaves) {
        if (shown.has(n.base)) continue;
        const d = sub(n.pos, cam);
        const dist = len(d);
        if (dist <= n.radius) { shown.add(n.base); continue; }
        const angle = Math.acos(Math.max(-1, Math.min(1, dot(d, fwd) / (dist * fl))));
        if (angle <= half + Math.asin(Math.min(1, n.radius / dist))) shown.add(n.base);
      }
    }
  }
  const isShown = (n: Node) => shown.has(n.base) || covered.has(n.base) || n.ancestors.some((a) => covered.has(a));
  const unshown = [...new Set(leaves.filter((n) => !isShown(n)).map((n) => n.base))];
  if (shots.length > 0)
    for (const id of unshown)
      issues.push({ severity: "warning", kind: "unseen_object", object: id,
        message: `No shot ever shows "${id}" (it is outside the camera view at the start, end and along every shot path).`,
        fix: `Aim a shot at "${id}" (focus or look), move a camera path past it, or remove it with patch_scene.` });

  // Flat grey world.
  const colors = new Set(leaves.map((n) => n.color));
  if (leaves.length >= 4 && colors.size === 1)
    issues.push({ severity: "warning", kind: "flat_palette", message: `All ${leaves.length} objects share one material colour (${[...colors][0]}), so the scene reads as grey boxes.`,
      fix: "Give the hero object, the ground and the background different material colours (warm against cool) with set_scene or patch_scene." });
  if (scene.sky.top.toLowerCase() === scene.sky.bottom.toLowerCase())
    issues.push({ severity: "warning", kind: "flat_sky", message: `The sky is one flat colour (${scene.sky.top}).`,
      fix: "Make sky.top and sky.bottom different (a deeper colour above, a warmer glow at the horizon) and consider fog." });

  // Camera paths through solids (the end points are validate_scene errors).
  const solids = boxes(expandObjects(scene.objects));
  for (const { f, s, n } of shots) {
    const hit = new Set<string>();
    for (let i = 1; i < PATH_SAMPLES; i++) {
      const p = pathAt(s, i / PATH_SAMPLES);
      const b = solids.find((x) => inside(p, x));
      if (b && !hit.has(b.id)) {
        hit.add(b.id);
        issues.push({ severity: "warning", kind: "path_through_solid", film: f.id, shot: n, object: b.id,
          message: `film "${f.id}" shot ${n}: the camera path passes through "${b.id}".`,
          fix: `Add a waypoint to shot ${n} that goes around "${b.id}", or move the start or end position (set_films).` });
      }
    }
  }

  // Film structure and captions.
  if (scene.objects.length > 0 && films.length === 0)
    issues.push({ severity: "info", kind: "no_films", message: "The scene has objects but no films, so nothing is shown.", fix: "Write 2 to 4 films with set_films, each with several captioned shots." });
  for (const f of films) {
    if (f.shots.length === 1)
      issues.push({ severity: "warning", kind: "thin_film", film: f.id, message: `film "${f.id}" has a single shot.`, fix: "Add shots (an establishing view, a closer look, a reveal) so the film has a start, a middle and an end." });
    f.shots.forEach((s, n) => {
      if (!s.caption)
        issues.push({ severity: "info", kind: "missing_caption", film: f.id, shot: n, message: `film "${f.id}" shot ${n} has no caption.`, fix: `Give shot ${n} a caption in plain words that says what the viewer sees (set_films).` });
      if (same(s.from.pos, s.to.pos) && !s.waypoints?.length && samePoint(s.from.look, s.to.look))
        issues.push({ severity: "info", kind: "static_shot", film: f.id, shot: n, message: `film "${f.id}" shot ${n} never moves (from equals to).`, fix: `Move the camera or the look-at target of shot ${n} a little so it drifts, orbits or pushes in (set_films).` });
    });
  }

  const count = (sev: SceneIssue["severity"]) => issues.filter((i) => i.severity === sev).length;
  const score = Math.max(0, 100 - 15 * count("error") - 6 * count("warning") - count("info"));
  return {
    score, ok: count("error") === 0 && count("warning") === 0, issues,
    stats: {
      objects: leaves.length, lights: scene.lights.length, colors: colors.size, films: films.length, shots: shots.length, duration_ms: films.reduce((t, f) => t + filmDuration(f.shots), 0),
      shown: new Set(leaves.filter(isShown).map((n) => n.base)).size, unshown: unshown.length, captioned_shots: shots.filter((x) => x.s.caption).length,
    },
  };
}
