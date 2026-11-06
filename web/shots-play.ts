// Shot timeline (docs/scenes.md "Shot timeline"): how a film's shots play. Pure, no DOM, no renderer.
// Reuses the scenario player's helpers (web/watch.ts): the in-out curve, the "about 40 s" label and the end card countdown.
import type { Film, Shot } from "../src/shots.ts";
import type { Vec3, View } from "../src/scene.ts";
import { aboutLabel, easeInOut, nextIndex } from "./watch.ts";

export {
  END_COUNTDOWN_MS, endCardActive, endCardCancel, endCardLine, endCardStart, endCardTick, clockLabel, durationLabel, tick, initialClock, SPEEDS, parseSpeed, speedLabel,
} from "./watch.ts";
export type { EndCard, Clock, Speed } from "./watch.ts";

export type Ease = "linear" | "in-out" | "out";
export type ObjectCenter = (id: string) => Vec3 | null;
export type Sample = { pos: Vec3; look: Vec3; fov?: number };

/** The focus ring fades in over the first and out over the last RING_FADE_MS of a shot. */
export const RING_FADE_MS = 500;

const unit = (t: number) => (Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0);

/** Eased progress for t in 0..1 (clamped; NaN is 0). linear: t. in-out: cubic (0.5 at 0.5). out: 1 - (1 - t)^3 (0.875 at 0.5). */
export function ease(kind: Ease, t: number): number {
  const x = unit(t);
  if (x === 0 || x === 1) return x;
  if (kind === "linear") return x;
  if (kind === "out") return 1 - Math.pow(1 - x, 3);
  return easeInOut(x);
}

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => (t <= 0 ? [...a] : t >= 1 ? [...b] : [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t]);

const cr = (p0: number, p1: number, p2: number, p3: number, u: number) =>
  0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);

/** A point on the path from -> waypoints -> to at t in 0..1: a uniform Catmull-Rom spline through every point (each segment takes an equal share of t, so
 *  waypoint k of n is hit exactly at t = k / (n + 1); the ends repeat). No waypoints: a straight line. t is clamped; t 0 and 1 return from and to exactly. */
export function pathSample(from: Vec3, waypoints: Vec3[], to: Vec3, t: number): Vec3 {
  const x = unit(t);
  if (x === 0) return [...from];
  if (x === 1) return [...to];
  if (waypoints.length === 0) return lerp3(from, to, x);
  const pts = [from, ...waypoints, to];
  const segs = pts.length - 1;
  const f = x * segs;
  const i = Math.min(segs - 1, Math.floor(f));
  const u = f - i;
  if (u === 0) return [...pts[i]!];
  const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(segs, i + 2)]!;
  return [cr(p0[0], p1[0], p2[0], p3[0], u), cr(p0[1], p1[1], p2[1], p3[1], u), cr(p0[2], p1[2], p2[2], p3[2], u)];
}

/** The point a view looks at: its Vec3, or the centre of its object, or `fallback` when the object is gone. */
export function resolveLook(view: View, objectCenter: ObjectCenter, fallback: Vec3): Vec3 {
  if (typeof view.look !== "string") return view.look;
  return objectCenter(view.look) ?? fallback;
}

/** The camera at t (0..1) of a shot: eased path for the position, eased blend of the two look points (look-at objects resolved on every call, so they may move).
 *  A vanished look-at object falls back to the other end's look, then to the origin. */
export function sampleShot(shot: Shot, t: number, objectCenter: ObjectCenter): Sample {
  const e = ease(shot.ease ?? "in-out", t);
  const origin: Vec3 = [0, 0, 0];
  const toLook = resolveLook(shot.to, objectCenter, typeof shot.from.look === "string" ? (objectCenter(shot.from.look) ?? origin) : shot.from.look);
  const fromLook = resolveLook(shot.from, objectCenter, toLook);
  return { pos: pathSample(shot.from.pos, shot.waypoints ?? [], shot.to.pos, e), look: lerp3(fromLook, toLook, e) };
}

// --- the film timeline -------------------------------------------------------------------------
const dur = (s: Shot) => (Number.isFinite(s.duration_ms) && s.duration_ms > 0 ? s.duration_ms : 0);

/** Shots play back to back with their exact durations: starts[i] is where shot i begins. Bad durations count as 0. */
export function buildFilmTimeline(film: Film): { total_ms: number; starts: number[] } {
  const starts: number[] = [];
  let t = 0;
  for (const s of film.shots) { starts.push(t); t += dur(s); }
  return { total_ms: t, starts };
}

/** Where the playhead is at `ms` (clamped): the shot and t (0..1) inside it. A boundary belongs to the next shot; zero-length shots are skipped.
 *  At or past the total (and for an empty film) `done` is true with the last shot at t 1 (shot 0, t 0 when empty). */
export function filmPositionAt(film: Film, ms: number): { shot: number; t: number; done: boolean } {
  const { total_ms, starts } = buildFilmTimeline(film);
  const n = film.shots.length;
  if (n === 0) return { shot: 0, t: 0, done: true };
  const m = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (m >= total_ms) return { shot: n - 1, t: 1, done: true };
  for (let i = 0; i < n; i++) {
    const d = dur(film.shots[i]!);
    if (d > 0 && m < starts[i]! + d) return { shot: i, t: (m - starts[i]!) / d, done: false };
  }
  return { shot: n - 1, t: 1, done: true };
}

/** Start time (ms) of a shot; the index is rounded and clamped. 0 for an empty film. */
export function seekToShot(film: Film, shot: number): number {
  const { starts } = buildFilmTimeline(film);
  if (starts.length === 0) return 0;
  const i = Number.isFinite(shot) ? Math.max(0, Math.min(starts.length - 1, Math.round(shot))) : 0;
  return starts[i]!;
}

/** Each shot's share of the total (they sum to 1). All durations 0: equal shares. Empty film: []. */
export function chapterFractions(film: Film): number[] {
  const n = film.shots.length;
  const { total_ms } = buildFilmTimeline(film);
  if (n === 0) return [];
  return film.shots.map((s) => (total_ms > 0 ? dur(s) / total_ms : 1 / n));
}

/** "5 shots · about 40 s"; "1 shot · about 10 s"; "no shots" for an empty film. */
export function filmLabel(film: Film): string {
  const n = film.shots.length;
  if (n === 0) return "no shots";
  return `${n === 1 ? "1 shot" : `${n} shots`} · ${aboutLabel(buildFilmTimeline(film).total_ms)}`;
}

/** The ring around the focus object: alpha ramps 0 -> 1 over the first 500 ms and 1 -> 0 over the last 500 ms (short shots peak below 1). Object null (alpha 0) without a focus. */
export function focusRing(shot: Shot, msInShot: number): { object: string | null; alpha: number } {
  if (!shot.focus) return { object: null, alpha: 0 };
  const d = dur(shot);
  const m = Number.isFinite(msInShot) ? Math.max(0, Math.min(d, msInShot)) : 0;
  const alpha = Math.max(0, Math.min(1, m / RING_FADE_MS, (d - m) / RING_FADE_MS));
  return { object: shot.focus, alpha };
}

/** The subtitle: the shot's caption while Captions is on. */
export const captionFor = (shot: Pick<Shot, "caption"> | undefined, on: boolean): string | null => (on && shot?.caption ? shot.caption : null);

/** Play all: the film after `i`, or null at the last (the same rule as scenarios). */
export const playAll = (films: readonly Film[], i: number): { next: number | null } => ({ next: nextIndex(films.length, i) });
