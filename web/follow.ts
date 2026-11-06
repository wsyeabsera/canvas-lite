// Pure follow and tour logic for the watch page: no DOM, no Worker imports. page.ts feeds it events and timer ticks and
// draws what it returns. The presenter fold and the tour timeline mirror src/present.ts and src/flow.ts (those import the
// Worker's store, so the page keeps its own small copy; test/follow.test.ts pins both copies to the same answers).
import { TRANSITIONS, type Transition } from "./links.ts";

export type Target = { canvas: string; screen: string; transition: Transition };
export type Presenter = Target & { active: boolean };
export type TourStep = { screen: string; dwell_ms: number; note?: string };
export type Dot = { state: "current" | "visited" | "idle" };

const isTransition = (t: unknown): t is Transition => (TRANSITIONS as readonly string[]).includes(t as string);

/** Shapes the `presenter` of `GET .../canvases/<cid>`; null for none or garbage. */
export function parsePresenter(v: unknown): Presenter | null {
  const p = v as Partial<Presenter> | null;
  if (!p || typeof p.canvas !== "string" || typeof p.screen !== "string") return null;
  return { active: p.active === true, canvas: p.canvas, screen: p.screen, transition: isTransition(p.transition) ? p.transition : "none" };
}

/** Shapes the `tour` of `GET .../canvases/<cid>` (`{steps}` or null) into valid steps; bad steps are dropped. */
export function parseTour(v: unknown): TourStep[] {
  const raw = (v as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(raw)) return [];
  const out: TourStep[] = [];
  for (const s of raw) {
    if (!s || typeof s.screen !== "string" || typeof s.dwell_ms !== "number" || !(s.dwell_ms > 0)) continue;
    out.push(typeof s.note === "string" && s.note ? { screen: s.screen, dwell_ms: s.dwell_ms, note: s.note } : { screen: s.screen, dwell_ms: s.dwell_ms });
  }
  return out;
}

// --- following ---------------------------------------------------------------

/** `presenter`: the folded session; `following`: the Follow toggle (default on); `visited`: screens of this session in order. */
export type FollowState = { presenter: Presenter | null; following: boolean; visited: string[] };
export type Moved = { state: FollowState; jump: Target | null };

export const initialFollow = (): FollowState => ({ presenter: null, following: true, visited: [] });

/** Events older than the page (minus a little slack for clock skew) are history from the websocket backfill, never a jump. */
export const LIVE_SLACK_MS = 2000;
export const isLive = (ts: number, loadedAt: number, slack = LIVE_SLACK_MS) => ts >= loadedAt - slack;

const targetOf = (p: Presenter): Target => ({ canvas: p.canvas, screen: p.screen, transition: p.transition });

/** One `presenter.*` event. It always folds into the state; it yields a jump only when it is live, Follow is on, and it is a start or goto. A new session turns Follow back on. */
export function onPresenterEvent(s: FollowState, e: { kind: string; payload?: any; ts: number }, loadedAt: number): Moved {
  const p = e.payload ?? {};
  if (e.kind === "presenter.started" || e.kind === "presenter.goto") {
    const presenter: Presenter = { active: true, canvas: String(p.canvas), screen: String(p.screen), transition: isTransition(p.transition) ? p.transition : "none" };
    const started = e.kind === "presenter.started";
    const state: FollowState = {
      presenter,
      following: started ? true : s.following,
      visited: started ? [presenter.screen] : s.visited.includes(presenter.screen) ? s.visited : [...s.visited, presenter.screen],
    };
    return { state, jump: isLive(e.ts, loadedAt) && state.following ? targetOf(presenter) : null };
  }
  if (e.kind === "presenter.stopped") return { state: { ...s, presenter: s.presenter ? { ...s.presenter, active: false } : null }, jump: null };
  return { state: s, jump: null };
}

/** The stored session from `GET canvas`, used once per canvas load (the page guards that): when it is active on this canvas and Follow is on, offer to open on its screen. Backfilled events may have folded it already; the stored one is still the truth for the jump. */
export function onCanvasLoad(s: FollowState, presenter: Presenter | null, canvas: string): Moved {
  if (!presenter || !presenter.active) return { state: s, jump: null };
  const state: FollowState = s.presenter ? s : { presenter, following: s.following, visited: [presenter.screen] };
  return { state, jump: presenter.canvas === canvas && s.following ? targetOf(presenter) : null };
}

/** The viewer took over (a click or key in the stage, or the button): Claude's session goes on, the page stops moving. */
export const takeOver = (s: FollowState): FollowState => (s.following ? { ...s, following: false } : s);

/** Follow again: on, and jump to where Claude is now (null when nothing is active). */
export function resumeFollow(s: FollowState): Moved {
  const state = s.following ? s : { ...s, following: true };
  return { state, jump: state.presenter?.active ? targetOf(state.presenter) : null };
}

export type Pill = { kind: "live" | "taken"; name: string; n: number; m: number; text: string; dots: Dot[] | null };
export const MAX_DOTS = 12;

/** What the play stage shows about the session on `canvas`: null when none is active there, else the live pill (following) or the taken-over state (a Follow button). Steps come from the tour when the screen is in it, else from the screens visited. */
export function pillModel(s: FollowState, canvas: string, screens: readonly { id: string; name: string }[], tour: readonly TourStep[]): Pill | null {
  const p = s.presenter;
  if (!p || !p.active || p.canvas !== canvas) return null;
  const name = screens.find((x) => x.id === p.screen)?.name ?? p.screen;
  const ti = tour.findIndex((t) => t.screen === p.screen);
  let n: number, m: number, dots: Dot[] | null;
  if (ti >= 0) {
    n = ti + 1;
    m = tour.length;
    dots = m <= MAX_DOTS ? tour.map((_, i) => ({ state: i === ti ? "current" : i < ti ? "visited" : "idle" })) : null;
  } else {
    const vi = s.visited.indexOf(p.screen);
    n = vi >= 0 ? vi + 1 : s.visited.length + 1;
    m = Math.max(screens.length, n);
    dots = screens.length > 0 && m <= MAX_DOTS
      ? screens.map((x) => ({ state: x.id === p.screen ? "current" : s.visited.includes(x.id) ? "visited" : "idle" }))
      : null;
  }
  return { kind: s.following ? "live" : "taken", name, n, m, text: `${name}, step ${n} of ${m}`, dots };
}

// --- tour ----------------------------------------------------------------------

export type TourRun = { steps: TourStep[]; elapsed: number; playing: boolean; entered: number | null; done: boolean };
export type Enter = { index: number; step: TourStep };

export const tourTotal = (steps: readonly TourStep[]) => steps.reduce((a, s) => a + s.dwell_ms, 0);

/** Where a tour is `t` ms after it started (same answer as `tourPosition` in src/flow.ts). */
export function tourPosition(steps: readonly TourStep[], t: number): { index: number; step: TourStep; into_ms: number; progress: number; done: boolean } | null {
  if (steps.length === 0) return null;
  let start = 0;
  const at = Math.max(0, t);
  for (let i = 0; i < steps.length; i++) {
    const end = start + steps[i].dwell_ms;
    if (at < end) return { index: i, step: steps[i], into_ms: at - start, progress: (at - start) / steps[i].dwell_ms, done: false };
    start = end;
  }
  const last = steps.length - 1;
  return { index: last, step: steps[last], into_ms: steps[last].dwell_ms, progress: 1, done: true };
}

/** A fresh run, playing from the first step; call `tourTick(run, 0)` to enter it. */
export const tourStart = (steps: TourStep[]): TourRun => ({ steps, elapsed: 0, playing: steps.length > 0, entered: null, done: false });

/** Advances a playing run by `dt` ms. Returns the step to enter when the position moved onto a new one; at the end the run stops (`done`), the last step stays shown. Paused or done runs do not move. */
export function tourTick(run: TourRun, dt: number): { run: TourRun; enter: Enter | null } {
  if (!run.playing || run.done) return { run, enter: null };
  const elapsed = run.elapsed + Math.max(0, dt);
  const pos = tourPosition(run.steps, elapsed);
  if (!pos) return { run: { ...run, playing: false, done: true }, enter: null };
  const enter = pos.index !== run.entered ? { index: pos.index, step: pos.step } : null;
  return { run: { ...run, elapsed, entered: pos.index, playing: !pos.done, done: pos.done }, enter };
}

export const tourPause = (run: TourRun): TourRun => (run.playing ? { ...run, playing: false } : run);
/** Resume a paused run; a finished one starts again from the top. */
export const tourResume = (run: TourRun): TourRun => (run.done ? tourStart(run.steps) : run.playing ? run : { ...run, playing: true });

/** The note of the step on show while the run is playing or paused; none once it is finished. */
export const tourCaption = (run: TourRun | null): string | null => (run && !run.done && run.entered !== null ? run.steps[run.entered]?.note ?? null : null);

/** Text of the Tour button: `Tour` (idle or finished), `Pause · 2/5` while playing, `Resume · 2/5` while paused. */
export function tourLabel(run: TourRun | null): string {
  if (!run || run.done || run.entered === null) return "Tour";
  return `${run.playing ? "Pause" : "Resume"} · ${run.entered + 1}/${run.steps.length}`;
}
