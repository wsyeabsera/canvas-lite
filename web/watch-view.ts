// Scenario video player (docs/ui.md "Watch"): the picker and the player. DOM only; every timing, seek, link-finding and countdown
// rule is in watch.ts and unit-tested. Screens render in `sandbox="allow-same-origin"` frames (never allow-scripts); the page
// reads `[data-to]` / `[data-back]` boxes from `frame.contentDocument` to know where the cursor goes. The frames never take the pointer.
import { iframeSpec, type CanvasDetail, type Screen } from "./canvas.ts";
import { thumbFit } from "./landing.ts";
import { fitStage, planTransition, playFrameSpec, resolveTransition, defaultFrame } from "./play.ts";
import {
  buildTimeline, captionFor, centerOf, chapterFractions, clampPt, clockLabel, cursorStart, durationLabel, endCardActive, endCardCancel, endCardLine, endCardStart,
  endCardTick, endOutcome, findScenario, fractionOf, goesBack, initialClock, lerpPt, nextStepMs, parseSpeed, pickerLine, pickLink, playableSteps, positionAt, prevStepMs,
  scenarioChip, scrubLabel, seekFraction, SPEEDS, speedLabel, stepAtFraction, stepsLabel, tick, travelState, tryItScreen, watchKey,
  type Clock, type EndCard, type LinkCandidate, type Position, type Pt, type Scenario, type ScenarioStep, type Timeline,
} from "./watch.ts";

export type WatchInput = { detail: CanvasDetail | null; state: "loading" | "ok" | "missing" | "error" };
export type WatchHooks = {
  /** Esc or Exit: back to where Watch was opened. */
  exit: () => void;
  /** Scenarios (or Esc in the player): the picker. */
  picker: () => void;
  /** A card or Play all: open the player on this scenario (the page changes the route). */
  pick: (scenarioId: string) => void;
  /** Try it yourself: Play at this screen. */
  tryIt: (screenId: string) => void;
  /** The scenario on show changed by itself (Next scenario, Play all): the page keeps the address in step. */
  moved: (scenarioId: string) => void;
};

type Cand = LinkCandidate & { rect: { x: number; y: number; w: number; h: number } };
type Layer = { id: string; root: HTMLElement; frame: HTMLIFrameElement; loaded: boolean; cands: Cand[] | null };

const NS = "http://www.w3.org/2000/svg";
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CAPTIONS_KEY = "lite.watch.captions";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function svg(d: string, size = 18, fill = true): SVGSVGElement {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("aria-hidden", "true");
  if (fill) s.setAttribute("fill", "currentColor");
  else for (const [k, v] of [["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "1.8"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"]]) s.setAttribute(k, v!);
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", d);
  s.append(p);
  return s;
}
const ICON = {
  play: "M7 4.5v15l13-7.5z",
  pause: "M7 4.5h3.6v15H7zM13.4 4.5H17v15h-3.4z",
  prev: "M7 5h2v14H7zM20 5v14L10 12z",
  next: "M15 5h2v14h-2zM4 5l10 7L4 19z",
  full: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  back: "M15 6l-6 6 6 6",
};
function button(cls: string, label: string, title?: string): HTMLButtonElement {
  const b = el("button", cls);
  b.type = "button";
  b.setAttribute("aria-label", label);
  if (title) b.title = title;
  return b;
}

export function createWatchView(hooks: WatchHooks) {
  // --- the DOM (built here; the styles are the `scenario video player` block of public/index.html) ----------------------
  const root = el("div", "wt");
  root.id = "wt";
  root.hidden = true;
  const msg = el("p", "wt-msg");
  msg.hidden = true;
  // picker
  const picker = el("section", "wt-picker");
  picker.hidden = true;
  // player
  const player = el("section", "wt-player");
  player.hidden = true;
  const stage = el("div", "pl-stage");
  const clip = el("div", "pl-clip");
  stage.append(clip);
  const cursor = el("div", "wt-cursor");
  const cursorSvg = document.createElementNS(NS, "svg");
  cursorSvg.setAttribute("viewBox", "0 0 28 34");
  cursorSvg.setAttribute("width", "28");
  cursorSvg.setAttribute("height", "34");
  const cp = document.createElementNS(NS, "path");
  cp.setAttribute("d", "M3 2v26l7-6.5 5 11.5 4-1.8-5-11.2H24z");
  cp.setAttribute("fill", "#fff");
  cp.setAttribute("stroke", "#111522");
  cp.setAttribute("stroke-width", "2");
  cp.setAttribute("stroke-linejoin", "round");
  cursorSvg.append(cp);
  cursor.append(cursorSvg);
  cursor.hidden = true;
  const ripple = el("div", "wt-ripple");
  ripple.hidden = true;
  const caption = el("div", "wt-caption");
  caption.hidden = true;
  caption.setAttribute("role", "status");
  const chip = el("div", "wt-g wt-chip");
  const chipName = el("span", "wt-chip-n");
  const chipOf = el("span", "wt-chip-o");
  chip.append(chipName, chipOf);
  const topRight = el("div", "wt-tr");
  const scenariosBtn = button("wt-g wt-top", "Scenarios", "All scenarios");
  scenariosBtn.textContent = "Scenarios";
  const exitBtn = button("wt-g wt-top", "Exit (Esc)", "Exit (Esc)");
  exitBtn.append("Exit ", el("kbd", undefined, "Esc"));
  topRight.append(scenariosBtn, exitBtn);

  const bar = el("div", "wt-g wt-bar");
  const scrub = el("div", "wt-scrub");
  const segs = el("div", "wt-segs");
  const thumb = el("div", "wt-thumb");
  const hoverChip = el("div", "wt-hover");
  hoverChip.hidden = true;
  scrub.append(segs, thumb, hoverChip);
  const ctl = el("div", "wt-ctl");
  const prevBtn = button("wt-ib", "Previous step (Left arrow)", "Previous step (Left arrow)");
  prevBtn.append(svg(ICON.prev));
  const playBtn = button("wt-play", "Pause (Space)", "Play / pause (Space)");
  const nextBtn = button("wt-ib", "Next step (Right arrow)", "Next step (Right arrow)");
  nextBtn.append(svg(ICON.next));
  const time = el("span", "wt-time");
  const capLabel = el("label", "wt-cap");
  const capSwitch = button("wt-switch", "Captions", "Captions (C)");
  capSwitch.setAttribute("role", "switch");
  capSwitch.append(el("span", "wt-knob"));
  capLabel.append(el("span", undefined, "Captions"), capSwitch);
  const speedBox = el("span", "wt-speed");
  speedBox.setAttribute("role", "group");
  speedBox.setAttribute("aria-label", "Speed");
  const speedBtns = SPEEDS.map((s) => {
    const b = button("wt-spd", `Speed ${speedLabel(s)}`);
    b.textContent = speedLabel(s);
    b.addEventListener("click", () => { b.blur(); setSpeed(s); });
    speedBox.append(b);
    return b;
  });
  const fullBtn = button("wt-ib", "Fullscreen (F)", "Fullscreen (F)");
  fullBtn.append(svg(ICON.full, 18, false));
  ctl.append(prevBtn, playBtn, nextBtn, time, el("span", "wt-fill"), capLabel, speedBox, fullBtn);
  bar.append(scrub, ctl);

  const endEl = el("div", "wt-end");
  endEl.hidden = true;
  player.append(stage, cursor, ripple, caption, chip, topRight, bar, endEl);
  root.append(msg, picker, player);
  document.getElementById("view-canvas")!.append(root);

  // --- state ------------------------------------------------------------------------------------------------------------
  let isOpen = false;
  let input: WatchInput | null = null;
  let wantId: string | null = null; // the scenario the route names (null: the picker)
  let armAll = false; // Play all pressed in the picker: the next player starts in all mode
  let all = false;
  let index = -1; // scenario on show
  let steps: ScenarioStep[] = [];
  let tl: Timeline = { segments: [], total: 0 };
  let clock: Clock = initialClock();
  let sig = "";
  let stepsJson = "";
  let layers = new Map<string, Layer>();
  let current: Layer | null = null;
  let leaving: { layer: Layer; timer: ReturnType<typeof setTimeout> } | null = null;
  let stageSize = { w: 1920, h: 1080 };
  let view = { x: 0, y: 0, k: 1 };
  let captionsOn = true;
  let end: EndCard | null = null;
  let raf = 0;
  let lastT = 0;
  let dragging = false;
  let shownFor = "";
  try { captionsOn = localStorage.getItem(CAPTIONS_KEY) !== "0"; } catch { /* storage can be blocked */ }

  const detail = () => input?.detail ?? null;
  const screens = (): Screen[] => detail()?.screens ?? [];
  const scenarios = (): Scenario[] => detail()?.scenarios ?? [];
  const ids = () => new Set(screens().map((s) => s.id));
  const screenName = (id: string) => screens().find((s) => s.id === id)?.name ?? id;
  const flowTransition = () => detail()?.canvas.transition ?? "none";
  const stepScreenId = (p: Position) => steps[p.phase === "travel" ? p.step - 1 : p.step]!.screen;

  function say(text: string | null) {
    msg.hidden = text === null;
    msg.textContent = text ?? "";
  }

  // --- the picker -------------------------------------------------------------------------------------------------------
  function poster(sc: Scenario): HTMLElement {
    const box = el("div", "wt-poster");
    const s = screens().find((x) => x.id === sc.steps[0]?.screen) ?? screens()[0];
    if (s) {
      const spec = iframeSpec(s);
      const f = document.createElement("iframe");
      f.setAttribute("sandbox", spec.sandbox);
      f.referrerPolicy = spec.referrerpolicy;
      f.title = spec.title;
      f.tabIndex = -1;
      f.setAttribute("aria-hidden", "true");
      f.width = String(spec.width);
      f.height = String(spec.height);
      f.srcdoc = spec.srcdoc;
      const r = thumbFit(spec.width, spec.height, 300, 169);
      f.style.transform = `scale(${r.scale})`;
      f.style.left = `${r.left}px`;
      f.style.top = `${r.top}px`;
      box.append(f);
    }
    box.append(el("span", "wt-dur", durationLabel(buildTimeline(playableSteps(sc, ids())).total || sc.duration_ms)));
    const badge = el("span", "wt-badge");
    badge.append(svg(ICON.play, 18));
    box.append(badge);
    return box;
  }

  function drawPicker() {
    const list = scenarios();
    const d = detail()!;
    const head = el("div", "wt-p-head");
    head.append(el("p", "wt-caps", pickerLine(d.canvas.name, list.map((s) => ({ steps: playableSteps(s, ids()) })))), el("h1", "wt-p-title", "Pick a scenario to watch"));
    const grid = el("div", "wt-grid");
    for (const sc of list) {
      const card = el("button", "wt-g wt-card");
      card.type = "button";
      card.setAttribute("aria-label", `Watch ${sc.name}`);
      const body = el("div", "wt-card-b");
      body.append(el("div", "wt-card-t", sc.name));
      if (sc.description) body.append(el("div", "wt-card-d", sc.description));
      body.append(el("div", "wt-card-s", stepsLabel(playableSteps(sc, ids()).length)));
      card.append(poster(sc), body);
      card.addEventListener("click", () => hooks.pick(sc.id));
      grid.append(card);
    }
    const allBtn = button("wt-blue", "Play all, one after another");
    allBtn.append(svg(ICON.play, 14), "Play all, one after another");
    allBtn.addEventListener("click", () => {
      armAll = true;
      hooks.pick(list[0]!.id);
    });
    const back = button("wt-g wt-top wt-p-back", "Back to the canvas (Esc)", "Back (Esc)");
    back.append(svg(ICON.back, 16, false), "Canvas ", el("kbd", undefined, "Esc"));
    back.addEventListener("click", () => hooks.exit());
    picker.replaceChildren(back, head, grid, allBtn);
    picker.scrollTop = 0;
  }

  // --- the stage --------------------------------------------------------------------------------------------------------
  const BAR_ROOM = 132; // the control bar and its margin
  function layout() {
    if (!isOpen || player.hidden) return;
    const TOP_ROOM = 48; // below the chip and the Scenarios / Exit buttons
    const f = fitStage(stageSize, { w: Math.max(1, root.clientWidth), h: Math.max(1, root.clientHeight - BAR_ROOM + 40 - TOP_ROOM) }, 56);
    const v = { ...f, y: f.y + TOP_ROOM };
    view = v;
    stage.style.width = `${stageSize.w}px`;
    stage.style.height = `${stageSize.h}px`;
    stage.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
    stage.style.setProperty("--k", String(v.k));
    stage.className = `pl-stage fr-${defaultFrame(stageSize.w, stageSize.h)}`;
    caption.style.left = `${v.x + (stageSize.w * v.k) / 2}px`;
    caption.style.top = `${v.y + stageSize.h * v.k - 22}px`;
    caption.style.maxWidth = `${Math.max(240, stageSize.w * v.k * 0.82)}px`;
    if (shownFor) drawCursor(positionAt(tl, clock.ms));
  }

  function makeLayer(s: Screen): Layer {
    const spec = playFrameSpec(s);
    const rootEl = el("div", "pl-scr");
    rootEl.style.width = `${s.width}px`;
    rootEl.style.height = `${s.height}px`;
    rootEl.style.visibility = "hidden";
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", spec.sandbox); // allow-same-origin only: no scripts
    f.setAttribute("referrerpolicy", spec.referrerpolicy);
    f.title = spec.title;
    f.tabIndex = -1;
    const layer: Layer = { id: s.id, root: rootEl, frame: f, loaded: false, cands: null };
    const done = () => {
      if (layer.loaded) return;
      layer.loaded = true;
      layer.cands = null;
      if (isOpen && !player.hidden && layers.get(layer.id) === layer) drawCursor(positionAt(tl, clock.ms));
      kick();
    };
    f.addEventListener("load", done, { once: true });
    setTimeout(done, 2000); // a frame that never loads must not freeze the video
    f.srcdoc = spec.srcdoc;
    rootEl.append(f);
    clip.append(rootEl);
    return layer;
  }

  /** The link boxes of a loaded layer, in screen pixels, document order. */
  function candidates(l: Layer): Cand[] {
    if (l.cands) return l.cands;
    if (!l.loaded) return [];
    const doc = l.frame.contentDocument, win = l.frame.contentWindow;
    const out: Cand[] = [];
    if (doc && win) {
      for (const e of doc.querySelectorAll<HTMLElement>("[data-to],[data-back]")) {
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const back = e.getAttribute("data-back");
        const t = (e.textContent ?? "").replace(/\s+/g, " ").trim() || e.getAttribute("aria-label") || e.getAttribute("title") || "";
        out.push({ dataTo: e.getAttribute("data-to"), dataBack: back !== null && back.trim().toLowerCase() !== "false", text: t, rect: { x: r.left + win.scrollX, y: r.top + win.scrollY, w: r.width, h: r.height } });
      }
    }
    l.cands = out;
    return out;
  }

  function finishLeaving() {
    if (!leaving) return;
    clearTimeout(leaving.timer);
    leaving.layer.root.style.visibility = "hidden";
    leaving = null;
    for (const l of layers.values()) {
      l.root.classList.remove("pl-fade-in", "pl-in-r", "pl-in-l", "pl-slide-out-l", "pl-slide-out-r", "pl-push-out-l", "pl-push-out-r");
      l.root.style.zIndex = "";
    }
  }

  function showLayer(id: string, transition: string | null) {
    const next = layers.get(id);
    if (!next || next === current) return;
    finishLeaving();
    const old = current;
    current = next;
    next.root.style.visibility = "visible";
    const plan = old && transition ? planTransition(resolveTransition(transition, flowTransition(), reduced()), reduced()) : null;
    if (old && plan) {
      old.root.style.zIndex = "1";
      next.root.style.zIndex = "2";
      if (plan.fromClass) old.root.classList.add(plan.fromClass);
      next.root.classList.add(plan.toClass);
      leaving = { layer: old, timer: setTimeout(finishLeaving, plan.ms + 30) };
    } else if (old) old.root.style.visibility = "hidden";
  }

  // --- what a playhead position looks like ---------------------------------------------------------------------------------
  const toView = (p: Pt): Pt => ({ x: view.x + p.x * view.k, y: view.y + p.y * view.k });

  function drawCursor(p: Position | null) {
    cursor.hidden = ripple.hidden = true;
    if (!p || p.phase !== "travel" || !current) return;
    const target = steps[p.step]!;
    const hit = pickLink(candidates(current), target.screen, target.via, goesBack(steps, p.step));
    if (hit === null) return; // no such link on the screen: it simply changes
    const to = clampPt(centerOf(candidates(current)[hit]!.rect), stageSize);
    const st = travelState(p.progress, reduced());
    const at = toView(lerpPt(cursorStart(stageSize, to), to, st.glide));
    cursor.hidden = false;
    cursor.style.transform = `translate(${at.x - 3}px, ${at.y - 2}px) scale(${st.ripple !== null && st.ripple < 0.35 ? 0.86 : 1})`;
    if (st.ripple !== null) {
      const c = toView(to);
      ripple.hidden = false;
      ripple.style.left = `${c.x}px`;
      ripple.style.top = `${c.y}px`;
      ripple.style.opacity = String(1 - st.ripple);
      ripple.style.transform = `translate(-50%, -50%) scale(${0.35 + st.ripple * 1.15})`;
    }
  }

  /** Puts the screen, cursor and captions of position `p` on show. `how`: playing moves screens with the canvas transition, seeking cuts. */
  function sync(p: Position, how: "play" | "seek") {
    const id = stepScreenId(p);
    if (how === "seek") finishLeaving();
    showLayer(id, how === "play" && p.phase === "dwell" ? flowTransition() : null);
    shownFor = id;
    drawCursor(p);
    const cap = captionFor(steps[p.step], captionsOn);
    caption.hidden = cap === null || p.phase === "travel";
    if (cap !== null) caption.textContent = cap;
    drawBar(p);
  }

  function drawBar(p: Position | null = positionAt(tl, clock.ms)) {
    if (!p) return;
    const f = fractionOf(tl, clock.ms);
    thumb.style.left = `${f * 100}%`;
    [...segs.children].forEach((s, i) => {
      const seg = tl.segments[i]!;
      const fill = Math.max(0, Math.min(1, (clock.ms - seg.start) / (seg.end - seg.start)));
      (s.firstElementChild as HTMLElement).style.width = `${fill * 100}%`;
      s.classList.toggle("cur", i === p.step);
    });
    time.textContent = `${clockLabel(clock.ms)} / ${durationLabel(tl.total)}`;
    const playing = clock.playing;
    playBtn.replaceChildren(svg(playing ? ICON.pause : ICON.play, 22));
    playBtn.setAttribute("aria-label", playing ? "Pause (Space)" : "Play (Space)");
    prevBtn.disabled = p.step === 0 && p.phase === "dwell" && clock.ms < 300;
    nextBtn.disabled = end !== null;
    capSwitch.setAttribute("aria-checked", String(captionsOn));
    speedBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(SPEEDS[i] === clock.speed)));
    chipOf.textContent = scenarioChip(index, scenarios().length);
  }

  function buildSegs() {
    segs.replaceChildren(...chapterFractions(tl).map((c, i) => {
      const s = el("div", "wt-seg");
      s.style.left = `${c.start * 100}%`;
      s.style.width = `${c.width * 100}%`;
      s.append(el("i", "wt-seg-f"));
      s.dataset.step = String(i);
      return s;
    }));
  }

  // --- the clock loop ----------------------------------------------------------------------------------------------------------
  function neededLoaded(p: Position | null): boolean {
    if (!p) return true;
    const l = layers.get(stepScreenId(p));
    return !!l && l.loaded;
  }

  function frame(now: number) {
    raf = 0;
    if (!isOpen || player.hidden) return;
    const dt = Math.min(250, now - lastT); // a hidden tab must not jump the video ahead
    lastT = now;
    if (end) {
      const r = endCardTick(end, dt);
      end = r.card;
      drawEnd();
      if (r.fire && end.next !== null) return startScenario(end.next);
      if (endCardActive(end)) raf = requestAnimationFrame(frame);
      return;
    }
    if (!clock.playing) return;
    const r = tick(clock, dt, tl.total);
    const p = positionAt(tl, r.clock.ms);
    if (!neededLoaded(p)) { raf = requestAnimationFrame(frame); return; } // wait for the frame, the clock stands still
    clock = r.clock;
    if (p) sync(p, "play");
    if (r.ended) return onEnd();
    raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (raf || !isOpen || player.hidden) return;
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function onEnd() {
    const o = endOutcome(all, scenarios().length, index);
    if (o.kind === "next") return startScenario(o.scenario);
    end = endCardStart(o.next);
    drawEnd();
    drawBar();
    kick();
  }

  function drawEnd() {
    endEl.hidden = end === null;
    if (!end) return;
    const sc = scenarios()[index];
    const next = end.next === null ? null : scenarios()[end.next] ?? null;
    const card = el("div", "wt-g wt-end-card");
    card.append(el("p", "wt-end-k", "That was:"), el("h2", "wt-end-t", sc?.name ?? ""));
    const line = endCardLine(next?.name ?? null, end);
    if (line) card.append(el("p", "wt-end-n", line));
    const row = el("div", "wt-end-row");
    const replay = el("button", "wt-end-b", "Replay");
    replay.type = "button";
    replay.addEventListener("click", () => startScenario(index));
    row.append(replay);
    if (next && end.next !== null) {
      const n = el("button", "wt-end-b", "Next scenario");
      n.type = "button";
      const target = end.next;
      n.addEventListener("click", () => startScenario(target));
      row.append(n);
    }
    const screen = tryItScreen(steps);
    if (screen) {
      const t = el("button", "wt-end-b wt-blue", "Try it yourself (Play)");
      t.type = "button";
      t.addEventListener("click", () => hooks.tryIt(screen));
      row.append(t);
    }
    card.append(row);
    endEl.replaceChildren(card);
  }

  // --- controls -------------------------------------------------------------------------------------------------------------------
  function hideEnd() {
    end = null;
    endEl.hidden = true;
  }

  /** Jump the playhead to `ms` (a step boundary) and re-render from there. */
  function seek(ms: number) {
    if (!tl.segments.length) return;
    hideEnd();
    if (ms >= tl.total) {
      clock = { ...clock, ms: tl.total, playing: false };
      const p = positionAt(tl, tl.total)!;
      sync(p, "seek");
      return onEnd();
    }
    clock = { ...clock, ms };
    const p = positionAt(tl, ms)!;
    sync(p, "seek");
    kick();
  }

  function toggle() {
    if (!tl.segments.length) return;
    if (end || clock.ms >= tl.total) {
      hideEnd();
      clock = { ...clock, ms: 0, playing: true };
      return seek(0);
    }
    clock = { ...clock, playing: !clock.playing };
    drawBar();
    if (clock.playing) kick();
  }

  function setSpeed(s: number) {
    clock = { ...clock, speed: parseSpeed(s) };
    drawBar();
  }

  function setCaptions(on: boolean) {
    captionsOn = on;
    try { localStorage.setItem(CAPTIONS_KEY, on ? "1" : "0"); } catch { /* ignore */ }
    const p = positionAt(tl, clock.ms);
    if (p) sync(p, "seek");
  }

  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void player.requestFullscreen?.().catch(() => {});
  }

  const press = (b: HTMLElement, fn: () => void) => b.addEventListener("click", () => { b.blur(); fn(); });
  press(playBtn, toggle);
  press(prevBtn, () => seek(prevStepMs(tl, clock.ms)));
  press(nextBtn, () => seek(nextStepMs(tl, clock.ms)));
  press(capSwitch, () => setCaptions(!captionsOn));
  press(fullBtn, toggleFull);
  press(scenariosBtn, () => hooks.picker());
  press(exitBtn, () => hooks.exit());
  document.addEventListener("fullscreenchange", () => { fullBtn.setAttribute("aria-pressed", String(!!document.fullscreenElement)); layout(); });

  // the scrubber: hover shows the chapter, click or drag seeks to a step boundary
  const fracAt = (e: PointerEvent) => {
    const r = scrub.getBoundingClientRect();
    return r.width > 0 ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0;
  };
  function hoverAt(e: PointerEvent) {
    if (!tl.segments.length) return;
    const f = fracAt(e);
    const i = stepAtFraction(tl, f);
    hoverChip.hidden = false;
    hoverChip.textContent = scrubLabel(i, steps[i]!, screenName(steps[i]!.screen));
    hoverChip.style.left = `${f * 100}%`;
  }
  scrub.addEventListener("pointermove", (e) => {
    hoverAt(e);
    if (dragging) { const ms = seekFraction(tl, fracAt(e)); if (ms !== clock.ms) seek(ms); }
  });
  scrub.addEventListener("pointerleave", () => { if (!dragging) hoverChip.hidden = true; });
  scrub.addEventListener("pointerdown", (e) => {
    if (!tl.segments.length) return;
    dragging = true;
    scrub.setPointerCapture(e.pointerId);
    seek(seekFraction(tl, fracAt(e)));
  });
  const drop = (e: PointerEvent) => {
    dragging = false;
    if (scrub.hasPointerCapture(e.pointerId)) scrub.releasePointerCapture(e.pointerId);
  };
  scrub.addEventListener("pointerup", drop);
  scrub.addEventListener("pointercancel", drop);

  // any click or key cancels the end card countdown
  root.addEventListener("pointerdown", () => { if (end && endCardActive(end)) { end = endCardCancel(end); drawEnd(); } }, true);
  window.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (end && endCardActive(end)) { end = endCardCancel(end); drawEnd(); }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = watchKey(e.key);
    if (!k) return;
    if (player.hidden && k !== "exit") return;
    const onButton = e.target instanceof HTMLButtonElement;
    if (k === "toggle" && onButton) return; // a focused button handles Space itself
    e.preventDefault();
    if (k === "exit") return hooks.exit();
    if (k === "toggle") toggle();
    else if (k === "prev") seek(prevStepMs(tl, clock.ms));
    else if (k === "next") { if (!end) seek(nextStepMs(tl, clock.ms)); }
    else if (k === "captions") setCaptions(!captionsOn);
    else if (k === "fullscreen") toggleFull();
  });
  window.addEventListener("resize", layout);

  // --- starting a scenario -----------------------------------------------------------------------------------------------------------
  function clearLayers() {
    finishLeaving();
    for (const l of layers.values()) l.root.remove();
    layers = new Map();
    current = null;
    shownFor = "";
    clip.replaceChildren();
  }

  const signature = (sc: Scenario) => JSON.stringify([sc, sc.steps.map((s) => { const x = screens().find((y) => y.id === s.screen); return x ? [x.id, x.updated_at, x.width, x.height] : null; })]);

  function startScenario(i: number, atMs = 0) {
    const sc = scenarios()[i];
    if (!sc) return;
    cancelAnimationFrame(raf);
    raf = 0;
    index = i;
    steps = playableSteps(sc, ids());
    tl = buildTimeline(steps);
    sig = signature(sc);
    stepsJson = JSON.stringify(sc.steps);
    wantId = sc.id;
    hideEnd();
    clearLayers();
    picker.hidden = true;
    player.hidden = false;
    say(null);
    chipName.textContent = sc.name;
    if (steps.length === 0) {
      bar.hidden = true;
      return say("This scenario has no steps that can play yet.");
    }
    bar.hidden = false;
    const first = screens().find((s) => s.id === steps[0]!.screen)!;
    stageSize = { w: first.width, h: first.height };
    for (const st of steps) if (!layers.has(st.screen)) layers.set(st.screen, makeLayer(screens().find((s) => s.id === st.screen)!));
    buildSegs();
    clock = { ...clock, ms: atMs, playing: true };
    layout();
    const p = positionAt(tl, atMs)!;
    sync(p, "seek");
    hooks.moved(sc.id);
    kick();
  }

  // --- opening, live data, closing -----------------------------------------------------------------------------------------------------
  function draw() {
    if (!isOpen) return;
    const d = detail();
    const reset = () => { clearLayers(); picker.hidden = true; player.hidden = true; cancelAnimationFrame(raf); raf = 0; index = -1; };
    if (!d) {
      reset();
      return say(input?.state === "missing" ? "This canvas does not exist or was removed." : input?.state === "error" ? "Could not load this canvas." : "Loading…");
    }
    if (scenarios().length === 0) {
      reset();
      return say("No scenarios yet: ask Claude to add some");
    }
    if (wantId === null) {
      reset();
      say(null);
      picker.hidden = false;
      return drawPicker();
    }
    const i = scenarios().findIndex((s) => s.id === wantId);
    if (i < 0) {
      reset();
      say("This scenario does not exist.");
      return;
    }
    startScenario(i);
  }

  return {
    isOpen: () => isOpen,
    /** Opens the picker (`scenarioId` null) or the player on a scenario; Play all (armed in the picker) carries into the player. */
    open(i: WatchInput, scenarioId: string | null) {
      input = i;
      isOpen = true;
      root.hidden = false;
      wantId = scenarioId;
      all = scenarioId !== null && armAll;
      armAll = false;
      sig = "";
      draw();
    },
    /** Live data: the player keeps playing unless its scenario or a screen it uses changed; the picker redraws. */
    render(i: WatchInput) {
      input = i;
      if (!isOpen) return;
      const sc = index >= 0 && !player.hidden ? scenarios()[index] : undefined;
      if (!sc) return draw();
      if (signature(sc) === sig) return;
      const keep = JSON.stringify(sc.steps) === stepsJson ? Math.min(clock.ms, Math.max(0, buildTimeline(playableSteps(sc, ids())).total - 1)) : 0;
      startScenario(index, keep);
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      root.hidden = true;
      cancelAnimationFrame(raf);
      raf = 0;
      clearLayers();
      hideEnd();
      if (document.fullscreenElement) void document.exitFullscreen();
      index = -1;
      input = null;
    },
  };
}
