// Watch mode for a 3D scene (docs/ui.md "Scenes"): what the film picker and the player show, on top of the shot timeline in
// web/shots-play.ts. Pure, no DOM; web/scene-watch-view.ts draws it. Unit tested in test/scene-watch.test.ts.
import type { Film, Shot } from "../src/shots.ts";
import type { Vec3, View } from "../src/scene.ts";
import { aboutLabel } from "./watch.ts";
import { buildFilmTimeline, chapterFractions, filmPositionAt, seekToShot } from "./shots-play.ts";

export type WatchFilm = Film & { duration_ms: number };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isVec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isView = (v: unknown): v is View => !!v && typeof v === "object" && isVec((v as View).pos) && (typeof (v as View).look === "string" || isVec((v as View).look));
const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : undefined);

/** `films` of the scene API, tolerant of gaps: shots without an id, a from/to view or a duration are dropped; films without an id are dropped. */
export function parseFilms(v: unknown): WatchFilm[] {
  if (!Array.isArray(v)) return [];
  const out: WatchFilm[] = [];
  for (const f of v as any[]) {
    if (!f || typeof f.id !== "string" || f.id === "" || !Array.isArray(f.shots)) continue;
    const shots: Shot[] = [];
    for (const s of f.shots as any[]) {
      if (!s || typeof s.id !== "string" || !isView(s.from) || !isView(s.to) || !isNum(s.duration_ms) || s.duration_ms <= 0) continue;
      const shot: Shot = { id: s.id, name: text(s.name) ?? s.id, from: s.from, to: s.to, duration_ms: s.duration_ms };
      if (Array.isArray(s.waypoints)) shot.waypoints = (s.waypoints as unknown[]).filter(isVec);
      if (s.ease === "linear" || s.ease === "in-out" || s.ease === "out") shot.ease = s.ease;
      const caption = text(s.caption), focus = text(s.focus);
      if (caption) shot.caption = caption;
      if (focus) shot.focus = focus;
      shots.push(shot);
    }
    const film: WatchFilm = { id: f.id, name: text(f.name) ?? f.id, shots, duration_ms: 0 };
    film.duration_ms = buildFilmTimeline(film).total_ms;
    const description = text(f.description);
    if (description) film.description = description;
    out.push(film);
  }
  return out;
}

export const findFilm = <F extends { id: string }>(list: readonly F[], id: string | null): number => (id === null ? -1 : list.findIndex((f) => f.id === id));

export const filmsLabel = (n: number) => (n === 1 ? "1 film" : `${n} films`);
export const shotsLabel = (n: number) => (n === 1 ? "1 shot" : `${n} shots`);

/** The picker's small caps line: `<scene name> · N films · about 1 min 40 s` (every film played once). */
export function filmPickerLine(sceneName: string, films: readonly Film[]): string {
  const total = films.reduce((a, f) => a + buildFilmTimeline(f).total_ms, 0);
  return `${sceneName} · ${filmsLabel(films.length)} · ${aboutLabel(total)}`;
}

/** The blue chip under the mode chip: `Shot 2 · The gate`. */
export const shotChip = (index: number, shot: Pick<Shot, "name">) => `Shot ${index + 1} · ${shot.name}`;

/** The scrubber's hover chip: `2 · <caption or name>`. */
export const shotScrubLabel = (index: number, shot: Pick<Shot, "name" | "caption">) => `${index + 1} · ${shot.caption ?? shot.name}`;

/** The top-left counter: `Film i of n`. */
export const filmChip = (index: number, count: number) => `Film ${index + 1} of ${count}`;

/** Scrubber geometry: each shot's slice of the bar (fractions of the total). */
export function shotChapters(film: Film): { start: number; width: number }[] {
  let at = 0;
  return chapterFractions(film).map((width) => { const c = { start: at, width }; at += width; return c; });
}

const total = (film: Film) => buildFilmTimeline(film).total_ms;

/** The playhead as a fraction of the film (0..1). */
export const filmFraction = (film: Film, ms: number): number => { const t = total(film); return t > 0 ? Math.max(0, Math.min(1, ms / t)) : 0; };

/** The shot under a point of the bar (fraction 0..1). */
export function shotAtFraction(film: Film, f: number): number {
  const t = total(film);
  return filmPositionAt(film, Math.min(Math.max(0, Math.min(1, Number.isFinite(f) ? f : 0)) * t, Math.max(0, t - 1))).shot;
}

/** Click or drag on the bar seeks to the start of the shot under the pointer. */
export const seekFilmFraction = (film: Film, f: number): number => seekToShot(film, shotAtFraction(film, f));

/** Previous shot: the start of the one before the shot on show (the first restarts at 0). */
export function prevShotMs(film: Film, ms: number): number {
  const p = filmPositionAt(film, Math.min(ms, Math.max(0, total(film) - 1)));
  return seekToShot(film, p.shot - 1);
}

/** Next shot: the start of the following one; from the last shot the end of the film. */
export function nextShotMs(film: Film, ms: number): number {
  const p = filmPositionAt(film, Math.min(ms, Math.max(0, total(film) - 1)));
  return p.shot + 1 < film.shots.length ? seekToShot(film, p.shot + 1) : total(film);
}

/** Live data while watching: the playhead stays where it was, clamped to the new film's length. */
export const clampPlayhead = (film: Film, ms: number): number => Math.max(0, Math.min(total(film), Number.isFinite(ms) ? ms : 0));

/** Reduced motion: each shot holds its start view (t 0) instead of flying; otherwise the shot plays as written. */
export const cameraT = (t: number, reduced: boolean): number => (reduced ? 0 : t);

export const CUT_FADE_MS = 300;

/** Opacity of the black veil over the view: under reduced motion each shot fades in from black over its first 300 ms; never otherwise. */
export const cutVeil = (msInShot: number, reduced: boolean): number => (reduced ? Math.max(0, Math.min(1, 1 - (Number.isFinite(msInShot) ? msInShot : 0) / CUT_FADE_MS)) : 0);

/** The ring's box around the focus object's screen rectangle: grown by RING_PAD px, at least RING_MIN px a side (centred). */
export const RING_PAD = 10;
export const RING_MIN = 36;
export function ringBox(b: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const w = Math.max(RING_MIN, b.w), h = Math.max(RING_MIN, b.h);
  return { x: b.x - (w - b.w) / 2, y: b.y - (h - b.h) / 2, w, h };
}
