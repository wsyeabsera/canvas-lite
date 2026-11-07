// Present mode: one screen at a time, fitted to the window on a dark stage. DOM only; the rules (back stack, transitions,
// focus geometry, fit, dots) are in play.ts and unit-tested. Screens render in `sandbox="allow-same-origin"` frames (never
// allow-scripts); the page reads `[data-to]` from `frame.contentDocument` and lays hotspots over the frame from their boxes.
import type { CanvasDetail, Screen } from "./canvas.ts";
import { backTransition, barVisible, BAR_IDLE_MS, chipText, currentId, defaultFrame, fitStage, follow, gotoScreen, isToast, isUnlinkedControl, keyIntent, linkAction, moveFocus, nextFrame, planTransition, playFrameSpec, progress, reconcile, startScreen, startState, UNLINKED_CHIP, UNLINKED_SELECTOR, type DeviceFrame, type LinkAction, type PlayState, type PlayTransition, type Step, type Toast } from "./play.ts";
import type { Rect } from "./viewport.ts";

export type PlayInput = { detail: CanvasDetail | null; state: "loading" | "ok" | "missing" | "error" };
export type PlayHooks = {
  exit: () => void;
  /** The screen on show changed (a link, back, restart or `goto`): the page keeps the route in step. */
  moved: (screenId: string) => void;
  /** The viewer moved by hand (a link, Back or Restart, by mouse or key): the page treats it as taking over from Claude or a tour. Never called for `goto`. */
  userAction?: () => void;
};
/** What `goto` did: moved, was already there, no such screen (a toast shows), or play is not open. */
export type GotoResult = "moved" | "same" | "missing" | "closed";

type Hot = { action: LinkAction; rect: Rect; radius: string };
type Layer = { id: string; html: string; root: HTMLElement; frame: HTMLIFrameElement; hots: Hot[]; unlinked: Rect[] };

const div = (cls: string, text?: string) => {
  const e = document.createElement("div");
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createPlayView(hooks: PlayHooks) {
  const $ = (id: string) => document.getElementById(id)!;
  const root = $("pl");
  const stage = $("pl-stage");
  const clip = $("pl-clip");
  const hot = $("pl-hot");
  const msg = $("pl-msg");
  const toastEl = $("pl-toast");
  const bar = $("pl-bar");
  const dotsEl = $("pl-dots");
  const nameEl = $("pl-name");
  const backBtn = $("pl-back") as HTMLButtonElement;
  const modeBtn = $("pl-mode");

  let isOpen = false;
  let input: PlayInput | null = null;
  let st: PlayState | null = null;
  let layer: Layer | null = null;
  let leaving: { layer: Layer; timer: ReturnType<typeof setTimeout> } | null = null;
  let seq = 0;
  let mode: "mouse" | "remote" = "mouse";
  let frame: DeviceFrame | null = null; // null: by the stage size
  let stageSize = { w: 1920, h: 1080 };
  let insetRight = 0; // walkthrough: room kept free at the right for the step rail
  let focusIdx: number | null = null;
  let hoverIdx: number | null = null;
  let lastActive = 0;
  let barHover = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const screens = (): Screen[] => input?.detail?.screens ?? [];
  const ids = () => new Set(screens().map((s) => s.id));
  const flow = () => input?.detail?.canvas ?? { start_screen: null, transition: "none" as const };
  const startId = () => startScreen(screens(), flow().start_screen);

  // --- stage -------------------------------------------------------------------
  function layout() {
    if (!isOpen) return;
    const v = fitStage({ w: stageSize.w, h: stageSize.h }, { w: Math.max(1, root.clientWidth - insetRight), h: root.clientHeight });
    stage.style.width = `${stageSize.w}px`;
    stage.style.height = `${stageSize.h}px`;
    stage.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
    stage.style.setProperty("--k", String(v.k));
    stage.className = `pl-stage fr-${frame ?? defaultFrame(stageSize.w, stageSize.h)}`;
  }

  function toast(text: string) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 2400);
  }

  function say(text: string | null) {
    msg.hidden = text === null;
    msg.textContent = text ?? "";
  }

  // --- bar -----------------------------------------------------------------------
  function wake() {
    lastActive = Date.now();
    root.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(sleep, BAR_IDLE_MS);
  }
  function sleep() {
    if (!isOpen) return;
    if (barVisible(Date.now(), lastActive, barHover)) idleTimer = setTimeout(sleep, BAR_IDLE_MS);
    else root.classList.add("idle");
  }

  function drawBar() {
    if (!st) return;
    const p = progress(screens(), st);
    const cur = screens().find((s) => s.id === currentId(st!));
    nameEl.textContent = cur ? `${cur.name} · ${p.label}` : p.label;
    dotsEl.replaceChildren(...(p.dots ?? []).map((d) => {
      const e = document.createElement("span");
      e.className = `pl-dot ${d.state}`;
      e.title = screens().find((s) => s.id === d.id)?.name ?? d.id;
      return e;
    }));
    backBtn.disabled = backTransition(st, reduced()) === null;
    modeBtn.textContent = mode === "remote" ? "Remote" : "Mouse";
    modeBtn.setAttribute("aria-pressed", String(mode === "remote"));
  }

  // --- screens and hotspots --------------------------------------------------------
  function scan(l: Layer) {
    const doc = l.frame.contentDocument;
    const win = l.frame.contentWindow;
    l.hots = [];
    l.unlinked = [];
    if (!doc || !win) return;
    const w = l.root.clientWidth, h = l.root.clientHeight;
    for (const e of doc.querySelectorAll<HTMLElement>("[data-to],[data-back]")) {
      const action = linkAction(e.getAttribute("data-to"), e.getAttribute("data-transition"), e.getAttribute("data-back"));
      if (!action) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const rect = { x: r.left + win.scrollX, y: r.top + win.scrollY, w: r.width, h: r.height };
      if (rect.x >= w || rect.y >= h) continue; // below or beside the frame: not reachable
      l.hots.push({ action, rect, radius: win.getComputedStyle(e).borderRadius });
    }
    // Control-looking elements that go nowhere: outlined on Shift, never clickable.
    for (const e of doc.querySelectorAll<HTMLElement>(UNLINKED_SELECTOR)) {
      const anc: ((n: string) => string | null)[] = [];
      for (let p = e.parentElement; p; p = p.parentElement) anc.push((n) => p.getAttribute(n));
      if (!isUnlinkedControl(e.tagName, (n) => e.getAttribute(n), anc)) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const rect = { x: r.left + win.scrollX, y: r.top + win.scrollY, w: r.width, h: r.height };
      if (rect.x >= w || rect.y >= h) continue;
      l.unlinked.push(rect);
    }
  }

  function setRings() {
    [...hot.children].forEach((c, i) => c.classList.toggle("focus", i === focusIdx));
  }

  function drawHotspots() {
    hot.replaceChildren();
    focusIdx = null;
    hoverIdx = null;
    if (!layer || !st) return;
    const state = st;
    layer.hots.forEach((h, i) => {
      const d = div("pl-hs");
      d.style.cssText = `left:${h.rect.x}px;top:${h.rect.y}px;width:${h.rect.w}px;height:${h.rect.h}px;border-radius:${h.radius}`;
      if (h.action.kind === "go" && !ids().has(h.action.to)) d.classList.add("dead");
      const chip = div("pl-chip", chipText(h.action, screens(), state, flow().transition, reduced()));
      if (h.rect.y + h.rect.h > stageSize.h - 56) chip.classList.add("above");
      d.append(chip);
      d.addEventListener("pointerenter", () => (hoverIdx = i));
      d.addEventListener("pointerleave", () => (hoverIdx = null));
      d.addEventListener("click", () => activate(i));
      hot.append(d);
    });
    for (const u of layer.unlinked) {
      const d = div("pl-nolink");
      d.style.cssText = `left:${u.x}px;top:${u.y}px;width:${u.w}px;height:${u.h}px`;
      const chip = div("pl-chip", UNLINKED_CHIP);
      if (u.y + u.h > stageSize.h - 56) chip.classList.add("above");
      d.append(chip);
      hot.append(d);
    }
    if (mode === "remote") {
      focusIdx = moveFocus(layer.hots.map((h) => h.rect), null, "right");
      setRings();
    }
  }

  function mount(s: Screen): { layer: Layer; ready: Promise<void> } {
    const spec = playFrameSpec(s);
    const el = div("pl-scr");
    el.style.width = `${s.width}px`;
    el.style.height = `${s.height}px`;
    el.style.visibility = "hidden"; // until loaded: never a blank flash
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", spec.sandbox); // allow-same-origin only: no scripts (pinned by a unit test)
    f.setAttribute("referrerpolicy", spec.referrerpolicy);
    f.title = spec.title;
    f.tabIndex = -1;
    const ready = new Promise<void>((res) => {
      f.addEventListener("load", () => res(), { once: true });
      setTimeout(res, 2000); // a frame that never loads must not freeze play
    });
    f.srcdoc = spec.srcdoc;
    el.append(f);
    clip.append(el);
    const l: Layer = { id: s.id, html: s.html, root: el, frame: f, hots: [], unlinked: [] };
    return { layer: l, ready };
  }

  function finishLeaving() {
    if (!leaving) return;
    clearTimeout(leaving.timer);
    leaving.layer.root.remove();
    leaving = null;
    for (const c of clip.children) c.classList.remove("pl-fade-in", "pl-in-r", "pl-in-l");
    hot.classList.remove("moving");
  }

  /** Puts `id` on show with `transition`; both screens are mounted while it plays. A newer call wins over one still loading. */
  async function show(id: string, transition: PlayTransition) {
    const s = screens().find((x) => x.id === id);
    if (!s || !isOpen) return;
    const mine = ++seq;
    finishLeaving();
    const m = mount(s);
    await m.ready;
    if (mine !== seq || !isOpen) {
      m.layer.root.remove();
      return;
    }
    try { await m.layer.frame.contentDocument?.fonts?.ready; } catch { /* fonts are optional */ }
    if (mine !== seq || !isOpen) {
      m.layer.root.remove();
      return;
    }
    scan(m.layer);
    const old = layer;
    layer = m.layer;
    layer.root.style.visibility = "";
    const plan = old ? planTransition(transition, reduced()) : null;
    hot.replaceChildren();
    if (old && plan) {
      old.root.style.zIndex = "1";
      layer.root.style.zIndex = "2";
      if (plan.fromClass) old.root.classList.add(plan.fromClass);
      layer.root.classList.add(plan.toClass);
      hot.classList.add("moving");
      leaving = { layer: old, timer: setTimeout(() => { finishLeaving(); drawHotspots(); }, plan.ms + 30) };
    } else {
      old?.root.remove();
      drawHotspots();
    }
    say(null);
    drawBar();
    hooks.moved(id);
  }

  function apply(r: Step | Toast | null): GotoResult {
    if (!r) return "same";
    if (isToast(r)) {
      toast(r.toast);
      return "missing";
    }
    st = r.state;
    void show(r.to, r.transition);
    return "moved";
  }

  function activate(i: number | null) {
    const h = i === null ? undefined : layer?.hots[i];
    if (!h || !st) return;
    hooks.userAction?.();
    apply(follow(st, h.action, ids(), flow().transition, reduced()));
  }

  function restart() {
    const id = startId();
    if (!id) return;
    hooks.userAction?.();
    st = startState(id);
    void show(id, "none");
  }

  /** Begins (or re-begins) play from the canvas data; `at` is a deep-linked screen, else the start screen. */
  function begin(at: string | null) {
    const d = input?.detail;
    if (!d || screens().length === 0) {
      say(input?.state === "missing" ? "This canvas does not exist or was removed." : input?.state === "error" ? "Could not load this canvas." : d ? "No screens to play yet" : "Loading…");
      return;
    }
    const id = at && ids().has(at) ? at : startId()!;
    const first = screens().find((s) => s.id === startId())!;
    stageSize = { w: first.width, h: first.height }; // the stage is the start screen's frame
    layout();
    st = startState(id);
    void show(id, "none");
  }

  // --- input -----------------------------------------------------------------------
  const quiet = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  window.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Shift") root.classList.add("show-links");
    if (e.altKey || e.ctrlKey || e.metaKey || quiet(e.target)) return;
    wake();
    const intent = keyIntent(e.key, mode, !!st && backTransition(st, reduced()) !== null);
    if (!intent) return;
    if (intent === "follow" && e.target instanceof HTMLButtonElement) return; // a focused bar button handles Enter itself
    e.preventDefault();
    if (typeof intent === "object") {
      if (!layer) return;
      focusIdx = moveFocus(layer.hots.map((h) => h.rect), focusIdx, intent.move);
      setRings();
    } else if (intent === "back") { if (st) { hooks.userAction?.(); apply(follow(st, { kind: "back" }, ids(), flow().transition, reduced())); } }
    else if (intent === "exit") hooks.exit();
    else if (intent === "restart") restart();
    else if (intent === "follow") activate(focusIdx ?? hoverIdx);
    else if (intent === "mode") setMode(mode === "mouse" ? "remote" : "mouse");
    else if (intent === "frame") {
      frame = nextFrame(frame ?? defaultFrame(stageSize.w, stageSize.h));
      layout();
    }
  });
  window.addEventListener("keyup", (e) => { if (e.key === "Shift") root.classList.remove("show-links"); });
  window.addEventListener("blur", () => root.classList.remove("show-links"));
  window.addEventListener("resize", layout);
  root.addEventListener("pointermove", wake);
  bar.addEventListener("pointerenter", () => (barHover = true));
  bar.addEventListener("pointerleave", () => { barHover = false; wake(); });

  function setMode(m: "mouse" | "remote") {
    mode = m;
    focusIdx = m === "remote" && layer ? moveFocus(layer.hots.map((h) => h.rect), null, "right") : null;
    setRings();
    drawBar();
  }

  const click = (id: string, fn: () => void) => $(id).addEventListener("click", (e) => { (e.currentTarget as HTMLElement).blur(); fn(); });
  click("pl-back", () => { if (st) { hooks.userAction?.(); apply(follow(st, { kind: "back" }, ids(), flow().transition, reduced())); } });
  click("pl-restart", restart);
  click("pl-mode", () => setMode(mode === "mouse" ? "remote" : "mouse"));
  click("pl-exit", () => hooks.exit());

  function reset() {
    seq++;
    finishLeaving();
    layer?.root.remove();
    layer = null;
    clip.replaceChildren();
    hot.replaceChildren();
    st = null;
    focusIdx = hoverIdx = null;
    toastEl.hidden = true;
    say(null);
  }

  return {
    isOpen: () => isOpen,
    /** Opens play on `at` (a screen id) or the canvas start screen; `i` is what the page has of the canvas so far. */
    open(i: PlayInput, at: string | null) {
      input = i;
      isOpen = true;
      root.hidden = false;
      reset();
      wake();
      layout();
      begin(at);
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      root.hidden = true;
      clearTimeout(idleTimer);
      root.classList.remove("show-links");
      reset();
      input = null;
    },
    /** Live data: a changed html reloads the screen in place, removed screens leave the history, the flow follows. */
    render(i: PlayInput, at: string | null = null) {
      input = i;
      if (!isOpen) return;
      if (!st) return begin(at);
      const next = reconcile(st, ids(), startId());
      if (!next) {
        st = null;
        reset();
        return begin(null);
      }
      const first = screens().find((x) => x.id === startId());
      if (first && (first.width !== stageSize.w || first.height !== stageSize.h)) {
        stageSize = { w: first.width, h: first.height };
        layout();
      }
      const was = currentId(st);
      st = next;
      const cur = screens().find((s) => s.id === currentId(next))!;
      if (currentId(next) !== was || !layer || layer.html !== cur.html) void show(cur.id, "none");
      else drawBar();
    },
    /** The hook a remote `goto` uses: moves to `screenId` with `transition` (a `data-transition` value; omitted: the canvas default). */
    goto(screenId: string, transition?: string | null): GotoResult {
      if (!isOpen || !st) return "closed";
      return apply(gotoScreen(st, screenId, transition ?? null, ids(), flow().transition, reduced()));
    },
    /** Walkthrough: keeps `px` free at the right of the stage (0 = full width) and refits. */
    setInset(px: number) {
      insetRight = px;
      layout();
    },
    /** The link boxes (screen pixels) of the screen on show, in document order. */
    links: (): Rect[] => (layer && !leaving ? layer.hots.map((h) => h.rect) : []),
    /** The screen on show, or null. */
    current: () => (st ? currentId(st) : null),
  };
}
