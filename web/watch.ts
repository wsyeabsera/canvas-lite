// Scenario video player logic (docs/ui.md "Watch"): the timeline of a scenario, where a playhead is, seeking, chapters, labels,
// which element the cursor clicks, play-all sequencing and the end card countdown. Pure, no DOM; web/watch-view.ts draws it.

// --- the scenario data (`scenarios` of the canvas API) ----------------------------------
export type ScenarioStep = { screen: string; via?: string; dwell_ms: number; caption?: string };
export type Scenario = { id: string; name: string; description?: string; steps: ScenarioStep[]; duration_ms: number; missing: number[] };

export const MIN_DWELL_MS = 200;
export const MAX_DWELL_MS = 60_000;
export const DEFAULT_DWELL_MS = 2500;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : undefined);

/** `scenarios` from the canvas JSON; tolerant of gaps. Entries without an id or without a step are dropped; the default is []. */
export function parseScenarios(v: unknown): Scenario[] {
  if (!Array.isArray(v)) return [];
  const out: Scenario[] = [];
  for (const s of v as any[]) {
    if (!s || typeof s.id !== "string" || s.id === "" || !Array.isArray(s.steps)) continue;
    const steps: ScenarioStep[] = [];
    for (const x of s.steps as any[]) {
      if (!x || typeof x.screen !== "string" || x.screen === "") continue;
      const step: ScenarioStep = { screen: x.screen, dwell_ms: isNum(x.dwell_ms) ? clamp(x.dwell_ms, MIN_DWELL_MS, MAX_DWELL_MS) : DEFAULT_DWELL_MS };
      const via = text(x.via), caption = text(x.caption);
      if (via) step.via = via;
      if (caption) step.caption = caption;
      steps.push(step);
    }
    if (steps.length === 0) continue;
    const missing = Array.isArray(s.missing) ? (s.missing as unknown[]).filter((i): i is number => Number.isInteger(i) && (i as number) >= 0) : [];
    const sc: Scenario = { id: s.id, name: text(s.name) ?? s.id, steps, duration_ms: isNum(s.duration_ms) ? s.duration_ms : steps.reduce((a, t) => a + t.dwell_ms, 0), missing };
    const description = text(s.description);
    if (description) sc.description = description;
    out.push(sc);
  }
  return out;
}

/** The steps that can play: not listed as missing and with a screen the canvas has. Order kept. */
export function playableSteps(sc: Pick<Scenario, "steps" | "missing">, screenIds: ReadonlySet<string>): ScenarioStep[] {
  const gone = new Set(sc.missing);
  return sc.steps.filter((s, i) => !gone.has(i) && screenIds.has(s.screen));
}

export const findScenario = (list: readonly Scenario[], id: string | null): Scenario | null => (id === null ? null : list.find((s) => s.id === id) ?? null);

// --- the timeline -------------------------------------------------------------------------
/** The cursor glides for GLIDE_MS, then the click ripple plays for CLICK_MS; the screen changes at the end of the travel. */
export const GLIDE_MS = 600;
export const CLICK_MS = 250;
export const TRAVEL_MS = GLIDE_MS + CLICK_MS;

export type Segment = { index: number; start: number; travelMs: number; dwellMs: number; end: number };
export type Timeline = { segments: Segment[]; total: number };

/** Step 0 only dwells; every later step first travels (cursor to the link, click) and then dwells. Times are at speed 1. */
export function buildTimeline(steps: readonly Pick<ScenarioStep, "dwell_ms">[]): Timeline {
  const segments: Segment[] = [];
  let t = 0;
  steps.forEach((s, index) => {
    const travelMs = index === 0 ? 0 : TRAVEL_MS;
    const dwellMs = Math.max(1, s.dwell_ms);
    segments.push({ index, start: t, travelMs, dwellMs, end: t + travelMs + dwellMs });
    t += travelMs + dwellMs;
  });
  return { segments, total: t };
}

export type Position = { step: number; phase: "travel" | "dwell"; progress: number; ms: number; done: boolean };

/** Where the playhead is at `ms` (clamped): the step, its phase and the progress (0..1) inside the phase. Null for no steps. `done` only at the very end. */
export function positionAt(tl: Timeline, ms: number): Position | null {
  const last = tl.segments[tl.segments.length - 1];
  if (!last) return null;
  const t = clamp(Number.isFinite(ms) ? ms : 0, 0, tl.total);
  if (t >= tl.total) return { step: last.index, phase: "dwell", progress: 1, ms: tl.total, done: true };
  const seg = tl.segments.find((s) => t < s.end)!;
  const into = t - seg.start;
  if (into < seg.travelMs) return { step: seg.index, phase: "travel", progress: into / seg.travelMs, ms: t, done: false };
  return { step: seg.index, phase: "dwell", progress: (into - seg.travelMs) / seg.dwellMs, ms: t, done: false };
}

/** Start time of a step, clamped to the steps there are. */
export const stepStart = (tl: Timeline, index: number): number => tl.segments[clamp(Math.round(index), 0, tl.segments.length - 1)]?.start ?? 0;

/** Previous step: the start of the one before the step on show (the first step restarts at 0). */
export function prevStepMs(tl: Timeline, ms: number): number {
  const p = positionAt(tl, ms);
  return p ? stepStart(tl, p.step - 1) : 0;
}

/** Next step: the start of the following one; from the last step the end of the scenario. */
export function nextStepMs(tl: Timeline, ms: number): number {
  const p = positionAt(tl, ms);
  if (!p) return 0;
  return p.step + 1 < tl.segments.length ? stepStart(tl, p.step + 1) : tl.total;
}

/** Scrubber geometry: each step's slice of the bar as fractions of the total (travel counts toward its step). */
export function chapterFractions(tl: Timeline): { start: number; width: number }[] {
  if (tl.total <= 0) return [];
  return tl.segments.map((s) => ({ start: s.start / tl.total, width: (s.end - s.start) / tl.total }));
}

export const fractionOf = (tl: Timeline, ms: number): number => (tl.total > 0 ? clamp(ms / tl.total, 0, 1) : 0);
export const msAtFraction = (tl: Timeline, f: number): number => clamp(f, 0, 1) * tl.total;

/** The step under a point of the bar (fraction 0..1). */
export function stepAtFraction(tl: Timeline, f: number): number {
  return positionAt(tl, Math.min(msAtFraction(tl, f), Math.max(0, tl.total - 1)))?.step ?? 0;
}

/** Seeking by click or drag lands on a step boundary: the start of the step under the pointer. */
export const seekFraction = (tl: Timeline, f: number): number => stepStart(tl, stepAtFraction(tl, f));

// --- the clock -----------------------------------------------------------------------------
export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];
export type Clock = { ms: number; playing: boolean; speed: number };

export const initialClock = (): Clock => ({ ms: 0, playing: true, speed: 1 });

/** `dt` real milliseconds pass: the playhead moves `dt * speed`; at the end it stops (ended: true once). */
export function tick(c: Clock, dt: number, total: number): { clock: Clock; ended: boolean } {
  if (!c.playing || !(dt > 0)) return { clock: c, ended: false };
  const ms = Math.min(total, c.ms + dt * c.speed);
  if (ms >= total) return { clock: { ...c, ms: total, playing: false }, ended: true };
  return { clock: { ...c, ms }, ended: false };
}

export const parseSpeed = (v: unknown): Speed => ((SPEEDS as readonly unknown[]).includes(v) ? (v as Speed) : 1);
export const speedLabel = (s: number) => `${s}x`;

// --- labels --------------------------------------------------------------------------------
/** m:ss, seconds rounded down (the playhead). */
export function clockLabel(ms: number): string {
  const s = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** m:ss, seconds rounded to the nearest (a total, a duration chip). */
export const durationLabel = (ms: number): string => clockLabel(Math.round(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000) * 1000);

/** "about 40 s", "about 2 min", "about 1 min 40 s": rounded to 5 s. */
export function aboutLabel(ms: number): string {
  const s = Math.max(5, Math.round(Math.max(0, ms) / 5000) * 5);
  const m = Math.floor(s / 60), r = s % 60;
  return `about ${m > 0 ? `${m} min` : ""}${m > 0 && r > 0 ? " " : ""}${r > 0 || m === 0 ? `${r} s` : ""}`;
}

export const stepsLabel = (n: number) => (n === 1 ? "1 step" : `${n} steps`);
export const scenariosLabel = (n: number) => (n === 1 ? "1 scenario" : `${n} scenarios`);

/** The picker's small caps line: `<canvas name> · N scenarios · about 1 min 40 s` (the total is every scenario played once). */
export function pickerLine(canvasName: string, scenarios: readonly { steps: readonly Pick<ScenarioStep, "dwell_ms">[] }[]): string {
  const total = scenarios.reduce((a, s) => a + buildTimeline(s.steps).total, 0);
  return `${canvasName} · ${scenariosLabel(scenarios.length)} · ${aboutLabel(total)}`;
}

/** The top-left chip: `Scenario i of n`. */
export const scenarioChip = (index: number, count: number) => `Scenario ${index + 1} of ${count}`;

/** The scrubber's hover chip: `2 · <caption or screen name>`. */
export const scrubLabel = (index: number, step: Pick<ScenarioStep, "caption">, screenName: string) => `${index + 1} · ${step.caption ?? screenName}`;

/** The subtitle: the step's caption while the Captions switch is on. */
export const captionFor = (step: Pick<ScenarioStep, "caption"> | undefined, on: boolean): string | null => (on && step?.caption ? step.caption : null);

// --- which element the cursor clicks -------------------------------------------------------
export type LinkCandidate = { dataTo: string | null; dataBack: boolean; text: string };

/** Going back: the step's screen is one an earlier step already showed. */
export const goesBack = (steps: readonly Pick<ScenarioStep, "screen">[], n: number): boolean => steps.slice(0, n).some((s) => s.screen === steps[n]?.screen);

/** Index of the candidate to click, in document order, or null (no such link: the screen then simply changes).
 *  An element whose `data-to` is the target wins; when going back and there is none, a `data-back` element does.
 *  `via` (case-insensitive substring of the text) chooses among several; when it matches none the first one stays. */
export function pickLink(cands: readonly LinkCandidate[], target: string, via: string | undefined, back: boolean): number | null {
  let hits = cands.flatMap((c, i) => (c.dataTo?.trim() === target ? [i] : []));
  if (hits.length === 0 && back) hits = cands.flatMap((c, i) => (c.dataBack ? [i] : []));
  if (hits.length === 0) return null;
  const v = via?.trim().toLowerCase();
  if (v) {
    const narrowed = hits.filter((i) => cands[i]!.text.toLowerCase().includes(v));
    if (narrowed.length > 0) hits = narrowed;
  }
  return hits[0]!;
}

// --- the cursor ----------------------------------------------------------------------------
export type Pt = { x: number; y: number };
export const easeInOut = (t: number) => { const x = clamp(t, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

/** Cursor state at `progress` (0..1) of a step's travel: how far along the glide it is (eased; reduced motion jumps) and the ripple (0..1, null before the click). */
export function travelState(progress: number, reducedMotion: boolean): { glide: number; ripple: number | null } {
  const g = GLIDE_MS / TRAVEL_MS;
  const p = clamp(progress, 0, 1);
  return { glide: reducedMotion || p >= g ? 1 : easeInOut(p / g), ripple: p >= g ? clamp((p - g) / (1 - g), 0, 1) : null };
}

export const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const centerOf = (r: { x: number; y: number; w: number; h: number }): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Where the cursor starts its glide: low and to the right of the stage centre, but never on the target itself. */
export function cursorStart(stage: { w: number; h: number }, target: Pt): Pt {
  const s = { x: stage.w * 0.78, y: stage.h * 0.86 };
  return Math.hypot(s.x - target.x, s.y - target.y) < 40 ? { x: stage.w * 0.5, y: stage.h * 0.3 } : s;
}

/** A point kept inside the stage (a link scrolled out of the frame still gets a visible cursor). */
export const clampPt = (p: Pt, stage: { w: number; h: number }): Pt => ({ x: clamp(p.x, 0, stage.w), y: clamp(p.y, 0, stage.h) });

// --- play all and the end card ----------------------------------------------------------------
export const END_COUNTDOWN_MS = 5000;

/** The scenario after `index`, or null at the last one. */
export const nextIndex = (count: number, index: number): number | null => (index + 1 < count ? index + 1 : null);

/** What happens when a scenario ends: Play all moves on at once, otherwise the end card shows (with the next one named, if any). */
export function endOutcome(all: boolean, count: number, index: number): { kind: "next"; scenario: number } | { kind: "card"; next: number | null } {
  const n = nextIndex(count, index);
  return all && n !== null ? { kind: "next", scenario: n } : { kind: "card", next: n };
}

export type EndCard = { next: number | null; remainingMs: number; cancelled: boolean };
export const endCardStart = (next: number | null): EndCard => ({ next, remainingMs: END_COUNTDOWN_MS, cancelled: next === null });
export const endCardCancel = (c: EndCard): EndCard => (c.cancelled ? c : { ...c, cancelled: true });
export const endCardActive = (c: EndCard) => !c.cancelled && c.next !== null;

/** `dt` real ms pass; `fire` once when the countdown reaches zero (then it is spent). */
export function endCardTick(c: EndCard, dt: number): { card: EndCard; fire: boolean } {
  if (!endCardActive(c) || !(dt > 0)) return { card: c, fire: false };
  const remainingMs = Math.max(0, c.remainingMs - dt);
  return remainingMs === 0 ? { card: { ...c, remainingMs: 0, cancelled: true }, fire: true } : { card: { ...c, remainingMs }, fire: false };
}

/** `Up next: <name>, starting in 5 s` while counting, `Up next: <name>` once cancelled; null when nothing is next. */
export function endCardLine(nextName: string | null, c: EndCard): string | null {
  if (nextName === null) return null;
  return endCardActive(c) ? `Up next: ${nextName}, starting in ${Math.ceil(c.remainingMs / 1000)} s` : `Up next: ${nextName}`;
}

/** The screen "Try it yourself" opens Play on: the scenario's last. */
export const tryItScreen = (steps: readonly Pick<ScenarioStep, "screen">[]): string | null => steps[steps.length - 1]?.screen ?? null;

// --- keys ------------------------------------------------------------------------------------
export type WatchKey = "toggle" | "prev" | "next" | "exit" | "captions" | "fullscreen" | null;

export function watchKey(key: string): WatchKey {
  switch (key) {
    case " ": case "Spacebar": return "toggle";
    case "ArrowLeft": return "prev";
    case "ArrowRight": return "next";
    case "Escape": return "exit";
    case "c": case "C": return "captions";
    case "f": case "F": return "fullscreen";
    default: return null;
  }
}
