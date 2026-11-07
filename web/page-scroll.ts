// Pure scroll-to-camera mapping for page mode (docs/scenes.md "Page"). No DOM, no Worker imports: the browser and unit tests use it.
// `sampleView` is the small shared shot interpolation (linear / in-out / out easing; a Catmull-Rom path through from.pos, waypoints,
// to.pos). If web/shots-play.ts exports the same behaviour, this one can be replaced by it; the tests pin the contract.
import type { Section } from "../src/page-model.ts";
import type { Vec3, View } from "../src/scene.ts";
import type { Film, Shot } from "../src/shots.ts";

export type SamplableShot = { from: View; to: View; waypoints?: Vec3[]; ease?: Shot["ease"] };
export type Look = Vec3 | string;
export type CameraAt = { pos: Vec3; look: Look; progress: number; section: number | null };

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const ease = (kind: Shot["ease"] | undefined, t: number): number => {
  t = clamp01(t);
  if (kind === "linear") return t;
  if (kind === "out") return 1 - (1 - t) * (1 - t);
  return t * t * (3 - 2 * t); // in-out (the default)
};

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function catmull(pts: Vec3[], t: number): Vec3 {
  const n = pts.length - 1; // segments
  const x = clamp01(t) * n;
  const i = Math.min(Math.floor(x), n - 1);
  const u = x - i;
  const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n)];
  const c = (k: number) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u);
  return [c(0), c(1), c(2)];
}

/** The camera view `t` (0..1, linear in time) through a shot: easing first, then position on the path, look by lerp (an object id holds, switching halfway if the two ends differ). */
export function sampleView(shot: SamplableShot, t: number): { pos: Vec3; look: Look } {
  const e = ease(shot.ease, t);
  const pts = [shot.from.pos, ...(shot.waypoints ?? []), shot.to.pos];
  const pos = pts.length === 2 ? lerp3(pts[0], pts[1], e) : catmull(pts, e);
  const a = shot.from.look, b = shot.to.look;
  const look: Look = typeof a !== "string" && typeof b !== "string" ? lerp3(a, b, e) : a === b ? a : e < 0.5 ? a : b;
  return { pos, look };
}

/** Pixel range of each section: sections stack one after another; a section's `gap_vh` (default 0) comes before it, `height_vh` (default 100) is its scroll length. */
export function sectionRanges(sections: Pick<Section, "height_vh" | "gap_vh">[], viewportHeight: number): { start: number; end: number }[] {
  let y = 0;
  return sections.map((s) => {
    y += ((s.gap_vh ?? 0) / 100) * viewportHeight;
    const start = y;
    y += ((s.height_vh ?? 100) / 100) * viewportHeight;
    return { start, end: y };
  });
}

function findShot(films: Film[], id: string): Shot | undefined {
  for (const f of films) for (const s of f.shots) if (s.id === id) return s;
  return undefined;
}

/** The shot a section plays: one shot as is; a pair is first shot's start view to second shot's end view (the first shot's easing, no waypoints). */
function playShot(section: Section, films: Film[]): SamplableShot | null {
  const ids = typeof section.shot === "string" ? [section.shot] : section.shot;
  const a = findShot(films, ids[0]), b = findShot(films, ids[ids.length - 1]);
  if (!a || !b) return null;
  return ids.length === 1 ? a : { from: a.from, to: b.to, ease: a.ease };
}

/**
 * The camera for a scroll offset. Inside a section: its shot at progress (scrollY - start) / (end - start). In a gap or after the last
 * section: the previous section's end view (section null, progress 1). Before the first section: the first section's start view
 * (section null, progress 0). A section whose shot is gone from the films is skipped as if absent; null when nothing resolves.
 */
export function cameraAt(page: { sections: Section[] }, films: Film[], scrollY: number, viewportHeight: number): CameraAt | null {
  const ranges = sectionRanges(page.sections, viewportHeight);
  const shots = page.sections.map((s) => playShot(s, films));
  let held: number | null = null; // last resolvable section that has ended at or before scrollY
  for (let i = 0; i < ranges.length; i++) {
    const shot = shots[i];
    if (!shot) continue;
    const { start, end } = ranges[i];
    if (scrollY < start) {
      if (held !== null) return { ...sampleView(shots[held]!, 1), progress: 1, section: null };
      return { ...sampleView(shot, 0), progress: 0, section: null };
    }
    if (scrollY < end) {
      const progress = end > start ? (scrollY - start) / (end - start) : 1;
      return { ...sampleView(shot, progress), progress, section: i };
    }
    held = i;
  }
  return held === null ? null : { ...sampleView(shots[held]!, 1), progress: 1, section: null };
}
