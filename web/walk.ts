// Walkthrough mode of Play (docs/prototype.md): the steps, stepping and auto-advance decisions. Pure, no DOM;
// web/walk-view.ts draws them. Steps come from the canvas tour when there is one, else from the screens in walk order.
// Auto-advance reuses the tour clock of web/follow.ts (tourStart / tourTick) instead of a second timer model.
import { tourStart, tourTick, tourTotal, type TourRun, type TourStep } from "./follow.ts";
import { extractLinks } from "./links.ts";
import { startScreen } from "./play.ts";

/** Dwell per step when there is no tour. */
export const WALK_DWELL_MS = 2500;
/** Auto-advance clock tick. */
export const WALK_TICK_MS = 100;

export type WalkScreen = { id: string; name: string; html: string };
export type WalkStep = { screen: string; name: string; dwell_ms: number; note: string | null };

/** No tour: start at the effective start and follow the first outgoing `data-to` of each screen (back links skipped) until a repeat, a dead end or a missing screen. Titled by screen name, no notes. */
export function deriveSteps(screens: readonly WalkScreen[], start: string | null): WalkStep[] {
  const byId = new Map(screens.map((s) => [s.id, s]));
  const out: WalkStep[] = [];
  const seen = new Set<string>();
  let id = startScreen(screens, start);
  while (id && !seen.has(id)) {
    const s = byId.get(id);
    if (!s) break;
    seen.add(id);
    out.push({ screen: s.id, name: s.name, dwell_ms: WALK_DWELL_MS, note: null });
    id = extractLinks(s.html).find((l) => !l.back)?.to ?? null;
  }
  return out;
}

/** The tour's steps (those whose screen exists) when it has any, else the derived ones. */
export function walkSteps(screens: readonly WalkScreen[], start: string | null, tour: readonly TourStep[]): { steps: WalkStep[]; fromTour: boolean } {
  const byId = new Map(screens.map((s) => [s.id, s]));
  const steps = tour.filter((t) => byId.has(t.screen)).map((t) => ({ screen: t.screen, name: byId.get(t.screen)!.name, dwell_ms: t.dwell_ms, note: t.note ?? null }));
  return steps.length > 0 ? { steps, fromTour: true } : { steps: deriveSteps(screens, start), fromTour: false };
}

/** Rail header: `5 steps · about 13 s` from the tour's total, `N screens` without a tour. */
export function walkHeader(steps: readonly WalkStep[], fromTour: boolean): string {
  if (!fromTour) return `${steps.length} ${steps.length === 1 ? "screen" : "screens"}`;
  return `${steps.length} ${steps.length === 1 ? "step" : "steps"} · about ${Math.max(1, Math.round(tourTotal(steps.map((s) => ({ screen: s.screen, dwell_ms: s.dwell_ms }))) / 1000))} s`;
}

/** Previous/Next target, null at the ends (the button is disabled). */
export function stepBy(steps: readonly unknown[], index: number, delta: 1 | -1): number | null {
  const i = index + delta;
  return i < 0 || i >= steps.length ? null : i;
}

/** The step a shown screen belongs to: the current step when it shows that screen, else the nearest later one, else the first; null when the screen is no step. */
export function stepForScreen(steps: readonly { screen: string }[], screen: string, current: number): number | null {
  if (steps[current]?.screen === screen) return current;
  for (let i = current + 1; i < steps.length; i++) if (steps[i]!.screen === screen) return i;
  const i = steps.findIndex((s) => s.screen === screen);
  return i < 0 ? null : i;
}

/** Keeps the index in range after the steps changed (live update). */
export const clampStep = (index: number, count: number) => Math.max(0, Math.min(index, count - 1));

// --- auto-advance ----------------------------------------------------------------
export type Auto = { base: number; run: TourRun };

/** Auto-advance from step `from`, already on show; on the last step it starts again from the top (`base` 0, and the caller enters step 0). */
export function autoStart(steps: readonly WalkStep[], from: number): Auto | null {
  if (steps.length === 0) return null;
  const base = from >= steps.length - 1 && steps.length > 1 ? 0 : from;
  const run = tourStart(steps.slice(base).map((s) => ({ screen: s.screen, dwell_ms: s.dwell_ms })));
  return { base, run: base === from ? { ...run, entered: 0 } : run };
}

/** Advances by `dt` ms. `enter` is the absolute step to show when the clock moved onto a new one; `auto` is null once the last step has run its dwell. */
export function autoTick(a: Auto, dt: number): { auto: Auto | null; enter: number | null } {
  const x = tourTick(a.run, dt);
  return { auto: x.run.done ? null : { base: a.base, run: x.run }, enter: x.enter ? a.base + x.enter.index : null };
}

// --- spotlight --------------------------------------------------------------------
export type Box = { x: number; y: number; w: number; h: number };

/** The box to spotlight: the first link of the screen in reading order (top, then left), else none. */
export function spotTarget(boxes: readonly Box[]): Box | null {
  let best: Box | null = null;
  for (const b of boxes) if (!best || b.y < best.y - 1 || (Math.abs(b.y - best.y) <= 1 && b.x < best.x)) best = b;
  return best;
}

export type BubblePlace = { left: number; top: number; side: "below" | "above" };
/** Where the callout goes, in the boxes' coordinates: below the target when it fits, else above; kept inside `bounds` horizontally. */
export function bubblePlace(target: Box, bubble: { w: number; h: number }, bounds: { w: number; h: number }, gap = 14): BubblePlace {
  const below = target.y + target.h + gap + bubble.h <= bounds.h;
  const top = below ? target.y + target.h + gap : Math.max(0, target.y - gap - bubble.h);
  const left = Math.max(0, Math.min(target.x + target.w / 2 - bubble.w / 2, bounds.w - bubble.w));
  return { left, top, side: below ? "below" : "above" };
}
