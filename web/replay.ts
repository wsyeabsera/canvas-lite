// Pure replay logic for the watch page: no DOM. Maps the canvas timeline (GET .../timeline) to a scrubber, playback timing,
// tick positions and labels. web/replay-view.ts draws what this returns.
import type { Screen } from "./canvas.ts";
import type { Box } from "./layout.ts";

export type TimelineEvent = { seq: number; ts: number; kind: string; screen: string | null; name: string | null };
export type AtScreen = { id: string; name: string; width: number; height: number; seq: number; html: string; box: Box };
export type AtState = { seq: number; screens: AtScreen[] };

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];
/** Longest pause shown between two events, in ms at 1x (idle time is compressed to this). */
export const MAX_GAP_MS = 1500;
/** Shortest pause, so events a millisecond apart (a batch) are still seen. */
export const MIN_GAP_MS = 350;

/** Shapes `GET .../timeline`; tolerant of gaps, ordered by seq. */
export function describeTimeline(api: unknown): TimelineEvent[] {
  const list = rec(api).events;
  if (!Array.isArray(list)) return [];
  return list
    .map((e) => {
      const r = rec(e);
      return { seq: num(r.seq), ts: num(r.ts), kind: str(r.kind), screen: typeof r.screen === "string" ? r.screen : null, name: typeof r.name === "string" ? r.name : null };
    })
    .sort((a, b) => a.seq - b.seq);
}

/** `floor` of `GET .../timeline`: the first seq with a reconstructable state (0 when absent or invalid). */
export const describeFloor = (api: unknown): number => Math.max(0, num(rec(api).floor));

/** The events the scrubber shows: those at or after the floor (older states were pruned). */
export const replayEvents = (events: readonly TimelineEvent[], floor: number): TimelineEvent[] => events.filter((e) => e.seq >= floor);

/** Shapes `GET .../at/<seq>`; each screen carries its box (from `layout`, else 0,0). */
export function describeAt(api: unknown): AtState {
  const r = rec(api);
  const screens = Array.isArray(r.screens) ? r.screens : [];
  return {
    seq: num(r.seq),
    screens: screens.map((s) => {
      const o = rec(s), l = rec(o.layout);
      const id = str(o.id), width = num(o.width, 100), height = num(o.height, 100);
      return { id, name: str(o.name, id), width, height, seq: num(o.seq), html: str(o.html), box: { id, x: num(l.x), y: num(l.y), w: width, h: height } };
    }),
  };
}

/** The frame-diff input for a state: `updated_at` is the event that wrote that version. */
export const asScreens = (s: AtState): Screen[] => s.screens.map((x) => ({ id: x.id, name: x.name, width: x.width, height: x.height, x: x.box.x, y: x.box.y, updated_at: x.seq, html: x.html }));

/** Index of the last event with seq at or before `seq`; -1 before the first. */
export function indexAtSeq(events: readonly TimelineEvent[], seq: number): number {
  let i = -1;
  for (let k = 0; k < events.length; k++) if (events[k].seq <= seq) i = k;
  return i;
}

/** Previous (-1) or next (+1) change, clamped to 0 .. total - 1. */
export const stepIndex = (index: number, total: number, dir: 1 | -1): number => (total <= 0 ? 0 : Math.min(total - 1, Math.max(0, index + dir)));

/** Scrubber fraction (0..1) to the nearest event index. */
export function indexFromFraction(f: number, total: number): number {
  if (total <= 1) return 0;
  const c = Math.min(1, Math.max(0, Number.isFinite(f) ? f : 0));
  return Math.round(c * (total - 1));
}

/** Tick position of each event as a fraction 0..1 (one event: centred). Ticks are evenly spaced, one per event. */
export const tickPositions = (total: number): number[] => Array.from({ length: Math.max(0, total) }, (_, i) => (total === 1 ? 0.5 : i / (total - 1)));

/** Per event: the screen created there (first `screen.set` of an id, or after a removal), else null. */
export function createdScreens(events: readonly TimelineEvent[]): ({ id: string; name: string } | null)[] {
  const live = new Set<string>();
  return events.map((e) => {
    if (e.kind === "screen.removed" && e.screen) live.delete(e.screen);
    if (e.kind !== "screen.set" || !e.screen) return null;
    if (live.has(e.screen)) return null;
    live.add(e.screen);
    return { id: e.screen, name: e.name ?? e.screen };
  });
}

/** Names above the ticks: index and name of every event that created a screen. */
export const tickNames = (events: readonly TimelineEvent[]): { index: number; name: string }[] =>
  createdScreens(events).flatMap((c, index) => (c ? [{ index, name: c.name }] : []));

/** The "just added" screen id at an event, or null. */
export const justAdded = (events: readonly TimelineEvent[], index: number): string | null => createdScreens(events)[index]?.id ?? null;

/** "HH:MM" of a timestamp; `tzOffsetMin` is `Date#getTimezoneOffset()` (minutes behind UTC), injected for tests. */
export function clock(ts: number, tzOffsetMin = new Date(ts).getTimezoneOffset()): string {
  const d = new Date(ts - tzOffsetMin * 60_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** "Event 3 of 12 · 14:05"; index is 0-based. */
export function eventLabel(index: number, total: number, ts: number | null, tzOffsetMin?: number): string {
  const head = `Event ${total === 0 ? 0 : index + 1} of ${total}`;
  return ts === null || total === 0 ? head : `${head} · ${clock(ts, tzOffsetMin)}`;
}

/** How long to wait after showing event `index` before showing the next: the recorded gap, kept between MIN and MAX, divided by speed. Null at the end. */
export function stepDelay(events: readonly TimelineEvent[], index: number, speed: number): number | null {
  if (index < 0 || index >= events.length - 1) return null;
  const gap = events[index + 1].ts - events[index].ts;
  const capped = Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, Number.isFinite(gap) ? gap : 0));
  return capped / (speed > 0 ? speed : 1);
}

/** Total playing time at a speed, in ms (what a whole session takes). */
export function totalDuration(events: readonly TimelineEvent[], speed: number): number {
  let sum = 0;
  for (let i = 0; i < events.length - 1; i++) sum += stepDelay(events, i, speed) ?? 0;
  return sum;
}

/** Where Play starts: at the end it restarts from the first event. */
export const playStart = (index: number, total: number): number => (index >= total - 1 ? 0 : Math.max(0, index));

export type ReplayAction = "prev" | "next" | "toggle" | "exit";
/** The key shortcuts of the replay bar. */
export function replayKey(key: string): ReplayAction | null {
  return key === "ArrowLeft" ? "prev" : key === "ArrowRight" ? "next" : key === " " || key === "Spacebar" ? "toggle" : key === "Escape" ? "exit" : null;
}
