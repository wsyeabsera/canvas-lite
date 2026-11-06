// DOM for the walkthrough mode of Play: the step rail, the top-left pill, the spotlight ring and the callout bubble. Draws what
// web/walk.ts decides and holds no rules. It sits over the play view (web/play-view.ts), which still shows the screens; a step
// is shown with `hooks.goto` (the play view's goto machinery and the canvas default transition).
import type { CanvasDetail } from "./canvas.ts";
import { autoStart, autoTick, bubblePlace, clampStep, spotTarget, stepBy, stepForScreen, walkHeader, walkSteps, WALK_TICK_MS, type Auto, type Box, type WalkStep } from "./walk.ts";
import { TRANSITION_MS } from "./play.ts";

export const RAIL_WIDTH = 344;
const RAIL_GAP = 16;

export type WalkHooks = {
  /** Shows a screen with the canvas default transition. */
  goto: (screen: string) => "moved" | "same" | "missing" | "closed";
  /** The link boxes of the screen on show, in screen pixels. */
  links: () => Box[];
  /** Reserves room at the right of the stage for the rail (0 = none). */
  setInset: (px: number) => void;
  exit: () => void;
  /** The viewer moved by hand (Next, Previous, a step, a key): the page treats it as taking over from Claude. */
  userAction: () => void;
};

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const sig = (steps: readonly WalkStep[]) => JSON.stringify(steps);

export function createWalkView(hooks: WalkHooks) {
  const root = document.getElementById("pl")!;
  const stage = document.getElementById("pl-stage")!;

  const pill = el("div", "island glass wk-pill");
  const pillName = el("span", "wk-pill-name");
  const exitBtn = el("button", "ib wk-exit");
  exitBtn.type = "button";
  exitBtn.title = "Exit (Esc)";
  exitBtn.append("Exit ", el("kbd", "", "Esc"));
  pill.append(el("span", "wk-pill-t", "Walkthrough"), pillName, exitBtn);

  const rail = el("aside", "glass wk-rail");
  rail.setAttribute("aria-label", "Walkthrough steps");
  const head = el("div", "wk-head");
  const list = el("ol", "wk-steps");
  const foot = el("div", "wk-foot");
  const autoRow = el("label", "wk-auto");
  const sw = el("button", "wk-switch");
  sw.type = "button";
  sw.setAttribute("role", "switch");
  sw.setAttribute("aria-checked", "false");
  sw.append(el("span", "wk-knob"));
  autoRow.append(el("span", "", "Auto-advance"), sw);
  const btns = el("div", "wk-btns");
  const prevBtn = el("button", "wk-btn wk-prev", "Previous");
  const nextBtn = el("button", "wk-btn wk-next", "Next");
  prevBtn.type = nextBtn.type = "button";
  btns.append(prevBtn, nextBtn);
  foot.append(autoRow, btns);
  rail.append(head, list, foot);

  const dim = el("div", "wk-dim"); // clips the dimming to the screen
  const ring = el("div", "wk-ring");
  dim.append(ring);
  const bubble = el("div", "glass wk-bubble");
  const bTitle = el("div", "wk-b-t");
  const bNote = el("div", "wk-b-n");
  const bHint = el("div", "wk-b-h", "Press → for the next step");
  bubble.append(bTitle, bNote, bHint);
  dim.hidden = bubble.hidden = true;
  pill.hidden = rail.hidden = true;
  stage.append(dim);
  root.append(pill, rail, bubble);

  let active = false;
  let detail: CanvasDetail | null = null;
  let steps: WalkStep[] = [];
  let fromTour = false;
  let index = 0;
  let auto: Auto | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let last = 0;
  let spotTimer: ReturnType<typeof setTimeout> | undefined;
  let shown: string | null = null; // the screen the play view has on show

  /** Auto-advance after the position changed by other means: from the new step on, off at the last one. */
  const resync = (i: number): Auto | null => (i >= steps.length - 1 ? null : autoStart(steps, i));

  function compute() {
    const d = detail;
    const r = d ? walkSteps(d.screens, d.canvas.start_screen, d.tour ?? []) : { steps: [] as WalkStep[], fromTour: false };
    steps = r.steps;
    fromTour = r.fromTour;
    index = clampStep(index, steps.length);
  }

  // --- spotlight and callout -------------------------------------------------------
  function hideSpot() {
    clearTimeout(spotTimer);
    dim.hidden = bubble.hidden = true;
  }
  function drawSpot() {
    clearTimeout(spotTimer);
    const step = steps[index];
    const t = step && step.screen === shown ? spotTarget(hooks.links()) : null; // a screen off the steps (a link followed) has no spotlight
    dim.hidden = !t;
    bubble.hidden = !(step && step.note && step.screen === shown);
    if (t) {
      ring.style.cssText = `left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px`;
      dim.classList.remove("in");
      void dim.offsetWidth;
      dim.classList.add("in");
    }
    if (!step || !step.note || step.screen !== shown) return;
    bTitle.textContent = `Step ${index + 1} · ${step.name}`;
    bNote.textContent = step.note;
    const r = root.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const k = sr.width / (stage.offsetWidth || 1);
    const box = t ? { x: sr.left - r.left + t.x * k, y: sr.top - r.top + t.y * k, w: t.w * k, h: t.h * k } : { x: sr.left - r.left + sr.width / 2, y: sr.top - r.top + sr.height - 8, w: 0, h: 0 };
    bubble.style.visibility = "hidden";
    bubble.hidden = false;
    const p = bubblePlace(box, { w: bubble.offsetWidth, h: bubble.offsetHeight }, { w: r.width - RAIL_WIDTH - RAIL_GAP * 2, h: r.height });
    bubble.style.left = `${p.left}px`;
    bubble.style.top = `${p.top}px`;
    bubble.dataset.side = p.side;
    bubble.style.visibility = "";
  }
  /** After a step's screen arrives: wait out the transition so the ring never sits on a moving screen. */
  function spotLater() {
    hideSpot();
    spotTimer = setTimeout(drawSpot, reduced() ? 0 : TRANSITION_MS + 60);
  }

  // --- rail -------------------------------------------------------------------------
  function drawRail() {
    head.textContent = walkHeader(steps, fromTour);
    list.replaceChildren(...steps.map((s, i) => {
      const li = el("li", `wk-step${i === index ? " cur" : ""}`);
      const b = el("button", "wk-step-b");
      b.type = "button";
      if (i === index) b.setAttribute("aria-current", "step");
      b.append(el("span", "wk-num", String(i + 1)), el("span", "wk-step-n", s.name));
      b.addEventListener("click", () => go(i, true));
      li.append(b);
      return li;
    }));
    list.children[index]?.scrollIntoView({ block: "nearest" });
    prevBtn.disabled = stepBy(steps, index, -1) === null;
    nextBtn.disabled = stepBy(steps, index, 1) === null;
    sw.setAttribute("aria-checked", String(auto !== null));
  }
  function drawPill() {
    pillName.textContent = detail?.canvas.name ?? "";
  }

  // --- stepping -----------------------------------------------------------------------
  function show(i: number) {
    index = i;
    drawRail();
    const r = hooks.goto(steps[i]!.screen);
    if (r === "same") spotLater(); // no move, so no `moved` to redraw the spotlight
  }
  /** `user`: by hand (rail, buttons, keys). The auto-advance clock restarts from the new step; it stops on the last one. */
  function go(i: number, user: boolean) {
    if (!active || i < 0 || i >= steps.length) return;
    if (user) {
      hooks.userAction();
      if (auto) auto = resync(i);
      if (!auto) stopClock();
    }
    show(i);
  }
  function step(delta: 1 | -1) {
    const i = stepBy(steps, index, delta);
    if (i !== null) go(i, true);
  }

  function stopClock() {
    clearInterval(timer);
    timer = undefined;
  }
  function setAuto(on: boolean) {
    stopClock();
    auto = on ? autoStart(steps, index) : null;
    if (auto) {
      if (auto.base !== index) show(auto.base);
      last = Date.now();
      timer = setInterval(() => {
        if (!auto) return stopClock();
        const n = Date.now();
        const x = autoTick(auto, n - last);
        last = n;
        auto = x.auto;
        if (x.enter !== null && x.enter !== index) show(x.enter);
        if (!auto) { stopClock(); drawRail(); }
      }, WALK_TICK_MS);
    }
    drawRail();
  }
  sw.addEventListener("click", () => setAuto(auto === null));
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));
  exitBtn.addEventListener("click", () => hooks.exit());

  // Capture phase, so these keys never reach the play view's own handler while the walkthrough is open.
  window.addEventListener("keydown", (e) => {
    if (!active || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const onBtn = t instanceof HTMLButtonElement;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") step(e.key === "ArrowRight" ? 1 : -1);
    else if (e.key === " " && !onBtn) setAuto(auto === null);
    else if (e.key === "Escape") hooks.exit();
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  return {
    isActive: () => active,
    /** The screen step 0 shows (where play opens), null when there are no steps. */
    first: (): string | null => steps[0]?.screen ?? null,
    /** Starts the walkthrough on step 0 and returns the screen to open play on (null: nothing to walk). */
    open(d: CanvasDetail | null): string | null {
      active = true;
      detail = d;
      index = 0;
      shown = null;
      auto = null;
      stopClock();
      compute();
      root.classList.add("walk");
      pill.hidden = rail.hidden = false;
      hooks.setInset(RAIL_WIDTH + RAIL_GAP * 2);
      drawPill();
      drawRail();
      hideSpot();
      return steps[0]?.screen ?? null;
    },
    close() {
      if (!active) return;
      active = false;
      detail = null;
      auto = null;
      stopClock();
      hideSpot();
      root.classList.remove("walk");
      pill.hidden = rail.hidden = true;
      hooks.setInset(0);
    },
    /** Live data: new steps (a new tour, edited links) redraw the rail; the step stays when it still exists. */
    render(d: CanvasDetail | null) {
      if (!active) return;
      detail = d;
      const before = sig(steps);
      compute();
      drawPill();
      if (sig(steps) !== before) {
        if (auto) auto = resync(index);
        if (!auto) stopClock();
        drawRail();
      }
    },
    /** The play view put `screen` on show (a step, a link, or a Follow jump from Claude): a step's screen moves the rail to it; any other screen leaves the rail as it is. The auto-advance state is untouched. */
    moved(screen: string) {
      if (!active) return;
      shown = screen;
      const i = stepForScreen(steps, screen, index);
      if (i !== null && i !== index) {
        index = i;
        if (auto) auto = resync(i);
        if (!auto) stopClock();
        drawRail();
      }
      spotLater();
    },
  };
}
