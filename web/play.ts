// Play mode logic (docs/prototype.md): the back stack, the next screen, transition resolution and planning, spatial focus,
// stage fit and progress dots. Pure, no DOM; web/play-view.ts draws it. The history lives only in the browser tab.
import { readLink, TRANSITIONS, type Transition } from "./links.ts";
import { fitRect, type Rect, type Size, type View } from "./viewport.ts";

/** The sandbox of a played screen. `allow-same-origin` lets the page read `[data-to]` from `frame.contentDocument`;
 *  there is NEVER `allow-scripts` (a unit test pins this string), so the screen still runs no code. */
export const PLAY_SANDBOX = "allow-same-origin";
export const TRANSITION_MS = 220;
export const BAR_IDLE_MS = 2000;

export type PlayFrameSpec = { sandbox: typeof PLAY_SANDBOX; referrerpolicy: "no-referrer"; title: string; width: number; height: number; srcdoc: string };
export const playFrameSpec = (s: { name: string; width: number; height: number; html: string }): PlayFrameSpec => ({
  sandbox: PLAY_SANDBOX, referrerpolicy: "no-referrer", title: s.name, width: s.width, height: s.height, srcdoc: s.html,
});

// --- links and transitions ------------------------------------------------------------
/** `back` plays the reverse of the way in; a push goes back as a push the other way. */
export type PlayTransition = Transition | "push-back";

export function reverseTransition(t: PlayTransition): PlayTransition {
  switch (t) {
    case "slide-left": return "slide-right";
    case "slide-right": return "slide-left";
    case "push": return "push-back";
    case "push-back": return "push";
    default: return t; // none, fade
  }
}

/** What a link does: `to` is the raw `data-transition` (null when absent), resolved only when followed. */
export type LinkAction = { kind: "go"; to: string; transition: string | null } | { kind: "back" };

/** From the three raw attribute values: `data-to` (a valid id) wins over `data-back`; anything else is no link. */
export function linkAction(to: string | null, transition: string | null, back: string | null): LinkAction | null {
  const l = readLink(to, transition, back);
  if (l) return { kind: "go", to: l.to, transition };
  return readLink("x", null, back)?.back ? { kind: "back" } : null;
}

/** The link's own valid `data-transition`, else the canvas default; always `none` under reduced motion. */
export function resolveTransition(raw: string | null, canvasDefault: Transition, reducedMotion: boolean): Transition {
  if (reducedMotion) return "none";
  const t = raw?.trim().toLowerCase() ?? "";
  return (TRANSITIONS as readonly string[]).includes(t) ? (t as Transition) : canvasDefault;
}

export type TransitionPlan = { fromClass: string | null; toClass: string; ms: number } | null;

/** The CSS classes (public/index.html) for the leaving and the entering screen layer; null = replace at once.
 *  fade: the old stays opaque underneath while the new fades in (a true cross-fade of opaque screens would dip to the dark stage).
 *  slide-*: the new screen slides over a still-moving-slightly old one; push: both move the full width together. */
export function planTransition(t: PlayTransition, reducedMotion: boolean): TransitionPlan {
  if (reducedMotion) return null;
  switch (t) {
    case "fade": return { fromClass: null, toClass: "pl-fade-in", ms: TRANSITION_MS };
    case "slide-left": return { fromClass: "pl-slide-out-l", toClass: "pl-in-r", ms: TRANSITION_MS };
    case "slide-right": return { fromClass: "pl-slide-out-r", toClass: "pl-in-l", ms: TRANSITION_MS };
    case "push": return { fromClass: "pl-push-out-l", toClass: "pl-in-r", ms: TRANSITION_MS };
    case "push-back": return { fromClass: "pl-push-out-r", toClass: "pl-in-l", ms: TRANSITION_MS };
    default: return null;
  }
}

// --- the navigation state -----------------------------------------------------------
export type Entry = { id: string; arrived: PlayTransition };
/** The back stack; the last entry is the screen on show, `arrived` is how the user got there. Never empty. */
export type PlayState = { stack: readonly Entry[] };
export type Step = { state: PlayState; from: string; to: string; transition: PlayTransition };
export type Toast = { toast: string };

export const startState = (id: string): PlayState => ({ stack: [{ id, arrived: "none" }] });
export const currentId = (s: PlayState): string => s.stack[s.stack.length - 1]!.id;

/** The screen play opens on: `start_screen` when it is a screen of the canvas, else the first one; null for no screens. */
export function startScreen(screens: readonly { id: string }[], start: string | null): string | null {
  return (start !== null && screens.some((s) => s.id === start) ? start : screens[0]?.id) ?? null;
}

/** The transition `back` would play, or null at the start of the history. */
export function backTransition(s: PlayState, reducedMotion: boolean): PlayTransition | null {
  if (s.stack.length < 2) return null;
  return reducedMotion ? "none" : reverseTransition(s.stack[s.stack.length - 1]!.arrived);
}

/** Go to a screen (a link, or a remote `goto`). Unknown target: a toast; the screen already on show: nothing. */
export function gotoScreen(s: PlayState, id: string, rawTransition: string | null, screenIds: ReadonlySet<string>, canvasDefault: Transition, reducedMotion: boolean): Step | Toast | null {
  if (!screenIds.has(id)) return { toast: `No screen "${id}"` };
  const from = currentId(s);
  if (from === id) return null;
  const transition = resolveTransition(rawTransition, canvasDefault, reducedMotion);
  return { state: { stack: [...s.stack, { id, arrived: transition }] }, from, to: id, transition };
}

/** Follow a link action. `back` at the start of the history does nothing (null). */
export function follow(s: PlayState, a: LinkAction, screenIds: ReadonlySet<string>, canvasDefault: Transition, reducedMotion: boolean): Step | Toast | null {
  if (a.kind === "go") return gotoScreen(s, a.to, a.transition, screenIds, canvasDefault, reducedMotion);
  const transition = backTransition(s, reducedMotion);
  if (!transition) return null;
  const stack = s.stack.slice(0, -1);
  return { state: { stack }, from: currentId(s), to: stack[stack.length - 1]!.id, transition };
}

/** After a live update: entries whose screen is gone leave the stack (an empty stack starts again at `start`). */
export function reconcile(s: PlayState, screenIds: ReadonlySet<string>, start: string | null): PlayState | null {
  const stack = s.stack.filter((e) => screenIds.has(e.id));
  if (stack.length === s.stack.length) return s;
  if (stack.length > 0) return { stack };
  return start !== null && screenIds.has(start) ? startState(start) : null;
}

export const isToast = (r: Step | Toast): r is Toast => "toast" in r;

// --- stage: fit, device frame ----------------------------------------------------------
export const STAGE_PADDING = 56;

/** Where the stage (the start screen's size) sits in the viewport: centred, aspect kept, letterboxed; reuses `fitRect`. */
export function fitStage(screen: Size, viewport: Size, padding = STAGE_PADDING): View {
  return fitRect({ x: 0, y: 0, w: screen.w, h: screen.h }, viewport, padding);
}

export type DeviceFrame = "none" | "tv" | "phone";
export const FRAMES: readonly DeviceFrame[] = ["none", "tv", "phone"];

/** The default frame by screen size: a wide 16:9-ish screen of 1280+ px is a TV, a narrow tall one a phone. Purely visual. */
export function defaultFrame(w: number, h: number): DeviceFrame {
  if (w >= 1280 && Math.abs(w / h - 16 / 9) < 0.1) return "tv";
  if (w <= 600 && h / w >= 1.6) return "phone";
  return "none";
}
export const nextFrame = (f: DeviceFrame): DeviceFrame => FRAMES[(FRAMES.indexOf(f) + 1) % FRAMES.length]!;

// --- spatial focus (TV remote mode) -----------------------------------------------------
export type Dir = "left" | "right" | "up" | "down";

/** The hotspot an arrow key focuses. With no focus: the first in reading order. Otherwise the nearest one whose centre lies
 *  in that direction (distance along the arrow plus twice the sideways offset); nothing in that direction keeps the focus. */
export function moveFocus(rects: readonly Rect[], current: number | null, dir: Dir): number | null {
  if (rects.length === 0) return null;
  if (current === null || !rects[current]) {
    let best = 0;
    rects.forEach((r, i) => {
      const b = rects[best]!;
      if (r.y < b.y - 1 || (Math.abs(r.y - b.y) <= 1 && r.x < b.x)) best = i;
    });
    return best;
  }
  const c = rects[current]!;
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  let best = current, bestScore = Infinity;
  rects.forEach((r, i) => {
    if (i === current) return;
    const dx = r.x + r.w / 2 - cx, dy = r.y + r.h / 2 - cy;
    const [along, across] = dir === "right" ? [dx, dy] : dir === "left" ? [-dx, dy] : dir === "down" ? [dy, dx] : [-dy, dx];
    if (along <= 1) return;
    const score = along + 2 * Math.abs(across);
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

export const arrowDir = (key: string): Dir | null => (key === "ArrowLeft" ? "left" : key === "ArrowRight" ? "right" : key === "ArrowUp" ? "up" : key === "ArrowDown" ? "down" : null);

/** Remote mode keys: Backspace and Escape go back, and leave play at the start of the history; Enter follows. */
export type KeyIntent = "back" | "exit" | "restart" | "follow" | "mode" | "frame" | { move: Dir } | null;

export function keyIntent(key: string, mode: "mouse" | "remote", canBack: boolean): KeyIntent {
  const d = arrowDir(key);
  if (key === "Enter") return "follow";
  if (key === "r" || key === "R") return "restart";
  if (key === "m" || key === "M") return "mode";
  if (key === "f" || key === "F") return "frame";
  if (mode === "remote") {
    if (d) return { move: d };
    if (key === "Backspace" || key === "Escape") return canBack ? "back" : "exit";
    return null;
  }
  if (key === "Escape") return "exit";
  if (key === "ArrowLeft" || key === "Backspace") return "back";
  return null;
}

// --- bar, dots, chip ---------------------------------------------------------------
/** The floating bar shows while the pointer is over it or the user acted within `idleMs`. */
export const barVisible = (now: number, lastActive: number, hovering: boolean, idleMs = BAR_IDLE_MS) => hovering || now - lastActive < idleMs;

export type Dot = { id: string; state: "current" | "visited" | "idle" };
/** Progress dots in canvas order (current, on the way here, other); above `max` screens only the "n / total" label. */
export function progress(screens: readonly { id: string }[], s: PlayState, max = 12): { dots: Dot[] | null; label: string } {
  const cur = currentId(s);
  const seen = new Set(s.stack.map((e) => e.id));
  const i = screens.findIndex((x) => x.id === cur);
  return {
    dots: screens.length > max ? null : screens.map((x) => ({ id: x.id, state: x.id === cur ? "current" : seen.has(x.id) ? "visited" : "idle" })),
    label: `${i + 1} / ${screens.length}`,
  };
}

/** The chip above a hovered or focused hotspot: `<target> · <transition> · Enter`. */
export function chipText(a: LinkAction, screens: readonly { id: string; name: string }[], s: PlayState, canvasDefault: Transition, reducedMotion: boolean): string {
  if (a.kind === "back") {
    const t = backTransition(s, reducedMotion);
    return t ? `Back · ${t} · Enter` : "Back · at the start";
  }
  const target = screens.find((x) => x.id === a.to);
  if (!target) return `No screen "${a.to}"`;
  return `${target.name} · ${resolveTransition(a.transition, canvasDefault, reducedMotion)} · Enter`;
}
