// The presenter session (docs/prototype-tools.md): Claude drives, the watch page follows. Stored as events, no table:
// the session is the latest `presenter.*` event of the project. Pure; nothing here imports the Worker runtime, so the
// watch page may import `applyPresenterEvent` and `followTarget` too.
import { checkId, requireCanvas, requireProject, TRANSITIONS, type Transition } from "./canvases.ts";
import { appendEvent, type LiteEvent, type Sql } from "./store.ts";

export type PresenterState = { active: boolean; canvas: string; screen: string; transition: Transition };

const isTransition = (t: unknown): t is Transition => (TRANSITIONS as readonly string[]).includes(t as string);

/** Pure fold: the presenter state after one event. `presenter.stopped` ends the session; other kinds change nothing. Returns null for no session. */
export function applyPresenterEvent(state: PresenterState | null, e: { kind: string; payload?: any }): PresenterState | null {
  const p = e.payload ?? {};
  if (e.kind === "presenter.started" || e.kind === "presenter.goto")
    return { active: true, canvas: String(p.canvas), screen: String(p.screen), transition: isTransition(p.transition) ? p.transition : "none" };
  if (e.kind === "presenter.stopped") return state ? { ...state, active: false } : { active: false, canvas: String(p.canvas), screen: "", transition: "none" };
  return state;
}

/** Pure follow logic: the view the page should show for a live presenter event, or null (do nothing). `following` is the Follow toggle. Off, or a stop, never moves the viewer. */
export function followTarget(e: { kind: string; payload?: any }, following: boolean): { canvas: string; screen: string; transition: Transition } | null {
  if (!following || (e.kind !== "presenter.started" && e.kind !== "presenter.goto")) return null;
  const s = applyPresenterEvent(null, e)!;
  return { canvas: s.canvas, screen: s.screen, transition: s.transition };
}

/** The project's presenter session from the log: the latest `presenter.*` event folded; null if there never was one. `active` false after a stop. */
export function presenterState(sql: Sql, project: string): PresenterState | null {
  const [r] = sql.all<{ kind: string; payload: string }>("SELECT kind, payload FROM events WHERE project = ? AND kind LIKE 'presenter.%' ORDER BY seq DESC LIMIT 1", project);
  return r ? applyPresenterEvent(null, { kind: r.kind, payload: JSON.parse(r.payload) }) : null;
}

function screenIds(sql: Sql, project: string, canvas: string): string[] {
  return sql.all<{ id: string }>("SELECT id FROM screens WHERE project = ? AND canvas = ? ORDER BY rowid", project, canvas).map((r) => r.id);
}

const checkTransition = (t: unknown): Transition | undefined => {
  if (t === undefined) return undefined;
  if (!isTransition(t)) throw new Error(`invalid transition "${String(t)}": use ${TRANSITIONS.join(", ")}`);
  return t;
};

const payloadOf = ({ active: _a, ...rest }: PresenterState) => rest;

/** Starts (or replaces) the project's presenter session on a canvas. Screen defaults to the start screen, else the first. Appends `presenter.started`. */
export function present(sql: Sql, project: string, input: { canvas: string; screen?: string }, now = Date.now()): { presenter: PresenterState; event: LiteEvent } {
  requireProject(sql, project);
  if (input.screen !== undefined) checkId("screen", input.screen);
  return sql.transaction(() => {
    const c = requireCanvas(sql, project, input.canvas);
    const ids = screenIds(sql, project, input.canvas);
    const screen = input.screen ?? (c.start_screen !== null && ids.includes(c.start_screen) ? c.start_screen : ids[0]);
    if (screen === undefined) throw new Error(`canvas "${input.canvas}" has no screens to present`);
    if (!ids.includes(screen)) throw new Error(`unknown screen "${screen}" on canvas "${input.canvas}"`);
    const presenter: PresenterState = { active: true, canvas: input.canvas, screen, transition: "none" };
    return { presenter, event: appendEvent(sql, { project, kind: "presenter.started", payload: payloadOf(presenter) }, now) };
  });
}

/** Moves the active session to a screen of its canvas. Appends `presenter.goto`. */
export function goto(sql: Sql, project: string, input: { screen: string; transition?: string }, now = Date.now()): { presenter: PresenterState; event: LiteEvent } {
  requireProject(sql, project);
  checkId("screen", input?.screen);
  const t = checkTransition(input.transition);
  return sql.transaction(() => {
    const cur = presenterState(sql, project);
    if (!cur || !cur.active) throw new Error("not presenting: call present first");
    const c = requireCanvas(sql, project, cur.canvas);
    if (!screenIds(sql, project, cur.canvas).includes(input.screen)) throw new Error(`unknown screen "${input.screen}" on canvas "${cur.canvas}"`);
    const presenter: PresenterState = { active: true, canvas: cur.canvas, screen: input.screen, transition: t ?? c.transition };
    return { presenter, event: appendEvent(sql, { project, kind: "presenter.goto", payload: payloadOf(presenter) }, now) };
  });
}

/** Ends the session. Nothing active: no event, `{active:false}`. Appends `presenter.stopped {canvas}`. */
export function stopPresent(sql: Sql, project: string, now = Date.now()): { presenter: { active: false; canvas?: string }; event: LiteEvent | null } {
  requireProject(sql, project);
  return sql.transaction(() => {
    const cur = presenterState(sql, project);
    if (!cur || !cur.active) return { presenter: { active: false as const }, event: null };
    return { presenter: { active: false as const, canvas: cur.canvas }, event: appendEvent(sql, { project, kind: "presenter.stopped", payload: { canvas: cur.canvas } }, now) };
  });
}
