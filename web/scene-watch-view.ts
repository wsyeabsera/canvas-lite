// Watch mode for a 3D scene (`#/project/<id>/scene/<sid>/watch[/<filmId>]`, docs/ui.md "Scenes"): the film picker and the film
// player. DOM only and thin: the shot timeline is web/shots-play.ts, the picker and player rules web/scene-watch.ts, the projection
// of the focus object web/scene-math.ts (all unit tested). The look and the bar are the scenario player's (web/watch-view.ts, the
// `wt-*` classes); Three.js comes in lazily through web/scene-render.ts. page.ts imports this module lazily.
import { checkScene, objectIds, type Scene, type Vec3 } from "../src/scene.ts";
import type { SceneView } from "./scene-render.ts";
import { screenBox } from "./scene-math.ts";
import { handOffCamera, modeSwitch } from "./scene-view.ts";
import {
  buildFilmTimeline, captionFor, clockLabel, durationLabel, endCardActive, endCardCancel, endCardLine, endCardStart, endCardTick, filmPositionAt, focusRing,
  initialClock, parseSpeed, playAll, sampleShot, SPEEDS, speedLabel, tick, type Clock, type EndCard,
} from "./shots-play.ts";
import {
  cameraT, clampPlayhead, cutVeil, filmChip, filmFraction, filmPickerLine, findFilm, nextShotMs, parseFilms, prevShotMs, ringBox, RING_PAD, seekFilmFraction,
  shotAtFraction, shotChapters, shotChip, shotScrubLabel, shotsLabel, type WatchFilm,
} from "./scene-watch.ts";
import { watchKey } from "./watch.ts";
import { hasWebGL2 } from "./webgl.ts";

export interface SceneWatchScreen {
  /** Shows the picker (`film` null) or plays a film; fetches the scene when it is not the one on show. */
  open(project: string, scene: string, film: string | null): void;
  /** A live `scene.set` or `films.set`: refetch, keep the playhead (clamped). */
  refetch(): void;
  /** Frees the renderer, stops the clock and the keys. */
  close(): void;
}

type Deps = {
  headers: () => Record<string, string>;
  locked: () => void;
  /** The chip's Exit: back to the designs. */
  exit: () => void;
  /** Esc in the picker, or Explore (Orbit): the Orbit route. */
  orbit: () => void;
  /** Films button, or Esc in the player: the picker route. */
  picker: () => void;
  /** A card or Play all: the player route of this film. */
  pick: (film: string) => void;
  /** The film on show changed by itself (Next film, Play all): keep the address in step without a history entry. */
  moved: (film: string) => void;
};

const NS = "http://www.w3.org/2000/svg";
const CAPTIONS_KEY = "lite.watch.captions"; // shared with the scenario player
const POSTER_KEY = (p: string, s: string) => `lite.scene.poster.${p}/${s}`; // the still Orbit caches
const BAR_ROOM = 132;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
};
function button(cls: string, label: string, title?: string): HTMLButtonElement {
  const b = el("button", cls);
  b.type = "button";
  b.setAttribute("aria-label", label);
  if (title) b.title = title;
  return b;
}

export function createSceneWatchScreen(host: HTMLElement, deps: Deps): SceneWatchScreen {
  // --- the DOM (styles: the `wt-*` block and the delimited "3D scene, Watch mode" block of public/index.html) -------------------
  const root = el("div", "wt sw");
  const msg = el("p", "wt-msg");
  msg.hidden = true;
  const picker = el("section", "wt-picker");
  picker.hidden = true;
  const player = el("section", "wt-player");
  player.hidden = true;
  const stage = el("div", "sw-stage");
  const veil = el("div", "sw-veil");
  const ring = el("div", "sw-ring");
  ring.hidden = true;
  const caption = el("div", "wt-caption");
  caption.hidden = true;
  caption.setAttribute("role", "status");
  const shotEl = el("div", "sw-shot");
  const topRight = el("div", "wt-tr");
  const filmTag = el("span", "wt-g sw-film");
  const filmsBtn = button("wt-g wt-top", "Films (Esc)", "All films (Esc)");
  filmsBtn.textContent = "Films";
  topRight.append(filmTag, filmsBtn);

  const bar = el("div", "wt-g wt-bar");
  const scrub = el("div", "wt-scrub");
  const segs = el("div", "wt-segs");
  const thumb = el("div", "wt-thumb");
  const hoverChip = el("div", "wt-hover");
  hoverChip.hidden = true;
  scrub.append(segs, thumb, hoverChip);
  const ctl = el("div", "wt-ctl");
  const prevBtn = button("wt-ib", "Previous shot (Left arrow)", "Previous shot (Left arrow)");
  prevBtn.append(svg(ICON.prev));
  const playBtn = button("wt-play", "Pause (Space)", "Play / pause (Space)");
  const nextBtn = button("wt-ib", "Next shot (Right arrow)", "Next shot (Right arrow)");
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
  player.append(stage, veil, ring, caption, shotEl, topRight, bar, endEl);

  // the scene's glass top chip: name, the mode switch, Exit (the same chip as Orbit)
  const chip = el("div", "sc-chip sc-g sw-chip");
  const chipName = el("span", "sc-chip-n", "Scene");
  const chipModes = el("span");
  const exitBtn = el("button", "sc-exit");
  exitBtn.type = "button";
  exitBtn.title = "Back to designs";
  exitBtn.textContent = "Exit";
  chip.append(chipName, chipModes, exitBtn);
  exitBtn.addEventListener("click", () => deps.exit());
  root.append(msg, picker, player, chip);
  host.replaceChildren(root);

  // --- state ------------------------------------------------------------------------------------------------------------
  let isOpen = false;
  let pid = "", sid = "";
  let seq = 0;
  let scene: Scene | null = null;
  let sceneSig = "";
  let ids = new Set<string>();
  let films: WatchFilm[] = [];
  let wantFilm: string | null = null;
  let armAll = false, all = false;
  let index = -1;
  let starts: number[] = [];
  let totalMs = 0;
  let clock: Clock = initialClock();
  let end: EndCard | null = null;
  let raf = 0, lastT = 0;
  let dragging = false;
  let captionsOn = true;
  try { captionsOn = localStorage.getItem(CAPTIONS_KEY) !== "0"; } catch { /* storage can be blocked */ }
  let render: Promise<typeof import("./scene-render.ts")> | null = null;
  let view: SceneView | null = null;
  let viewSig = "";
  const posters = new Map<string, string>(); // film signature -> data URL

  const film = (): WatchFilm | null => films[index] ?? null;
  const say = (text: string | null) => { msg.hidden = text === null; msg.textContent = text ?? ""; };
  const objectCenter = (id: string): Vec3 | null => (view && ids.has(id) ? view.lookPoint(id) : null);
  const loadRender = () => (render ??= import("./scene-render.ts"));

  function dropView() {
    view?.dispose();
    view = null;
    viewSig = "";
  }

  /** The player's renderer for the current scene (rebuilt when the scene changed); null without WebGL 2 or when it cannot start. */
  async function ensureView(my: number): Promise<SceneView | null> {
    if (!scene || !hasWebGL2()) return null;
    if (view && viewSig === sceneSig) return view;
    try {
      const m = await loadRender();
      if (my !== seq || !scene) return null;
      if (view && viewSig === sceneSig) return view;
      dropView();
      view = m.createSceneView(stage, scene);
      viewSig = sceneSig;
      return view;
    } catch {
      render = null;
      return null;
    }
  }

  // --- the picker -------------------------------------------------------------------------------------------------------
  const filmSig = (f: WatchFilm) => `${sceneSig}|${JSON.stringify(f.shots[0] ?? null)}`;

  /** Renders a first-frame poster per film from its first shot's start camera, in one offscreen view, then frees it. */
  async function makePosters(my: number) {
    if (!scene || !hasWebGL2()) return;
    const todo = films.filter((f) => !posters.has(filmSig(f)));
    if (todo.length === 0) return;
    try {
      const m = await loadRender();
      if (my !== seq || !scene || picker.hidden) return;
      const box = el("div", "sw-offscreen");
      document.body.append(box);
      const v = m.createSceneView(box, scene);
      const center = (id: string): Vec3 | null => (ids.has(id) ? v.lookPoint(id) : null);
      try {
        for (const f of todo) {
          const s0 = f.shots[0];
          if (s0) { const smp = sampleShot(s0, 0, center); v.setCamera({ pos: smp.pos, look: smp.look }); }
          else v.setCamera(scene.camera);
          posters.set(filmSig(f), v.poster());
        }
      } finally {
        v.dispose();
        box.remove();
      }
      if (my === seq && !picker.hidden) drawPicker();
    } catch {
      render = null; // the sky gradient stays
    }
  }

  function poster(f: WatchFilm): HTMLElement {
    const box = el("div", "wt-poster sw-poster");
    const src = posters.get(filmSig(f)) ?? (() => { try { return localStorage.getItem(POSTER_KEY(pid, sid)) ?? undefined; } catch { return undefined; } })();
    if (src) {
      const img = el("img");
      img.alt = "";
      img.src = src;
      box.append(img);
    } else if (scene) box.style.background = `linear-gradient(${scene.sky.top}, ${scene.sky.bottom})`;
    box.append(el("span", "wt-dur", durationLabel(f.duration_ms)));
    const badge = el("span", "wt-badge");
    badge.append(svg(ICON.play, 18));
    box.append(badge);
    return box;
  }

  function drawPicker() {
    if (!scene) return;
    const head = el("div", "wt-p-head");
    head.append(el("p", "wt-caps", filmPickerLine(scene.name, films)), el("h1", "wt-p-title", "Pick a film to watch"));
    const grid = el("div", "wt-grid");
    for (const f of films) {
      const card = el("button", "wt-g wt-card");
      card.type = "button";
      card.setAttribute("aria-label", `Watch ${f.name}`);
      const body = el("div", "wt-card-b");
      body.append(el("div", "wt-card-t", f.name));
      if (f.description) body.append(el("div", "wt-card-d", f.description));
      body.append(el("div", "wt-card-s", shotsLabel(f.shots.length)));
      card.append(poster(f), body);
      card.addEventListener("click", () => deps.pick(f.id));
      grid.append(card);
    }
    const allBtn = button("wt-blue", "Play all, one after another");
    allBtn.append(svg(ICON.play, 14), "Play all, one after another");
    allBtn.addEventListener("click", () => { armAll = true; deps.pick(films[0]!.id); });
    picker.replaceChildren(head, grid, allBtn);
  }

  // --- what a playhead position looks like ----------------------------------------------------------------------------------
  function sync() {
    const f = film();
    if (!f || f.shots.length === 0) return;
    const p = filmPositionAt(f, clock.ms);
    const shot = f.shots[p.shot]!;
    const msIn = Math.max(0, clock.ms - (starts[p.shot] ?? 0));
    const rm = reduced();
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    if (view) {
      const smp = sampleShot(shot, cameraT(p.t, rm), objectCenter);
      view.setCamera({ pos: smp.pos, look: smp.look });
    }
    veil.style.opacity = String(cutVeil(msIn, rm));
    // focus ring: the focus object's bounds projected with the camera just set
    const fr = focusRing(shot, msIn);
    const b = view && fr.object && fr.alpha > 0 ? view.bounds(fr.object) : null;
    const sb = b && view ? screenBox(view.camera(), w, h, b.min, b.max, RING_PAD) : null;
    ring.hidden = !sb;
    if (sb) {
      const r = ringBox(sb);
      ring.style.transform = `translate(${r.x}px, ${r.y}px)`;
      ring.style.width = `${r.w}px`;
      ring.style.height = `${r.h}px`;
      ring.style.opacity = String(fr.alpha);
    }
    const cap = captionFor(shot, captionsOn);
    caption.hidden = cap === null;
    if (cap !== null) caption.textContent = cap;
    caption.style.left = `${w / 2}px`;
    caption.style.top = `${h - BAR_ROOM - 10}px`;
    caption.style.maxWidth = `${Math.max(240, w * 0.7)}px`;
    shotEl.textContent = shotChip(p.shot, shot);
    drawBar(p.shot);
  }

  function drawBar(cur: number) {
    const f = film();
    if (!f) return;
    thumb.style.left = `${filmFraction(f, clock.ms) * 100}%`;
    [...segs.children].forEach((s, i) => {
      const d = f.shots[i]?.duration_ms ?? 0;
      const fill = d > 0 ? Math.max(0, Math.min(1, (clock.ms - (starts[i] ?? 0)) / d)) : 0;
      (s.firstElementChild as HTMLElement).style.width = `${fill * 100}%`;
      s.classList.toggle("cur", i === cur);
    });
    time.textContent = `${clockLabel(clock.ms)} / ${durationLabel(totalMs)}`;
    playBtn.replaceChildren(svg(clock.playing ? ICON.pause : ICON.play, 22));
    playBtn.setAttribute("aria-label", clock.playing ? "Pause (Space)" : "Play (Space)");
    prevBtn.disabled = cur === 0 && clock.ms < 300;
    nextBtn.disabled = end !== null;
    capSwitch.setAttribute("aria-checked", String(captionsOn));
    speedBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(SPEEDS[i] === clock.speed)));
    filmTag.textContent = `${f.name} · ${filmChip(index, films.length)}`;
  }

  function buildSegs() {
    const f = film();
    segs.replaceChildren(...(f ? shotChapters(f) : []).map((c, i) => {
      const s = el("div", "wt-seg");
      s.style.left = `${c.start * 100}%`;
      s.style.width = `${c.width * 100}%`;
      s.append(el("i", "wt-seg-f"));
      s.dataset.shot = String(i);
      return s;
    }));
  }

  // --- the clock loop ---------------------------------------------------------------------------------------------------------
  function frame(now: number) {
    raf = 0;
    if (!isOpen || player.hidden || document.hidden) return;
    const dt = Math.min(250, now - lastT);
    lastT = now;
    if (end) {
      const r = endCardTick(end, dt);
      end = r.card;
      drawEnd();
      if (r.fire && end.next !== null) return startFilm(end.next);
      if (endCardActive(end)) raf = requestAnimationFrame(frame);
      return;
    }
    if (!clock.playing) return;
    const r = tick(clock, dt, totalMs);
    clock = r.clock;
    sync();
    if (r.ended) return onEnd();
    raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (raf || !isOpen || player.hidden || document.hidden) return;
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  function onEnd() {
    const next = playAll(films, index).next;
    if (all && next !== null) return startFilm(next);
    end = endCardStart(next);
    drawEnd();
    drawBar(Math.max(0, (film()?.shots.length ?? 1) - 1));
    kick();
  }

  function drawEnd() {
    endEl.hidden = end === null;
    if (!end) return;
    const f = film();
    const next = end.next === null ? null : films[end.next] ?? null;
    const card = el("div", "wt-g wt-end-card");
    card.append(el("p", "wt-end-k", "That was:"), el("h2", "wt-end-t", f?.name ?? ""));
    const line = endCardLine(next?.name ?? null, end);
    if (line) card.append(el("p", "wt-end-n", line));
    const row = el("div", "wt-end-row");
    const replay = el("button", "wt-end-b", "Replay");
    replay.type = "button";
    replay.addEventListener("click", () => startFilm(index));
    row.append(replay);
    if (next && end.next !== null) {
      const n = el("button", "wt-end-b", "Next film");
      n.type = "button";
      const target = end.next;
      n.addEventListener("click", () => startFilm(target));
      row.append(n);
    }
    const ex = el("button", "wt-end-b wt-blue", "Explore (Orbit)");
    ex.type = "button";
    ex.addEventListener("click", explore);
    row.append(ex);
    card.append(row);
    endEl.replaceChildren(card);
  }

  function explore() {
    if (view) { const c = view.camera(); handOffCamera(pid, sid, { pos: c.pos, look: c.look }); }
    deps.orbit();
  }

  // --- controls ---------------------------------------------------------------------------------------------------------------
  const hideEnd = () => { end = null; endEl.hidden = true; };

  function seek(ms: number) {
    const f = film();
    if (!f || f.shots.length === 0) return;
    hideEnd();
    if (ms >= totalMs) {
      clock = { ...clock, ms: totalMs, playing: false };
      sync();
      return onEnd();
    }
    clock = { ...clock, ms };
    sync();
    kick();
  }

  function toggle() {
    if (!film()?.shots.length) return;
    if (end || clock.ms >= totalMs) { clock = { ...clock, playing: true }; return seek(0); }
    clock = { ...clock, playing: !clock.playing };
    sync();
    if (clock.playing) kick();
  }

  function setSpeed(s: number) {
    clock = { ...clock, speed: parseSpeed(s) };
    sync();
  }

  function setCaptions(on: boolean) {
    captionsOn = on;
    try { localStorage.setItem(CAPTIONS_KEY, on ? "1" : "0"); } catch { /* ignore */ }
    sync();
  }

  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void player.requestFullscreen?.().catch(() => {});
  }

  const press = (b: HTMLElement, fn: () => void) => b.addEventListener("click", () => { b.blur(); fn(); });
  press(playBtn, toggle);
  press(prevBtn, () => seek(prevShotMs(film()!, clock.ms)));
  press(nextBtn, () => seek(nextShotMs(film()!, clock.ms)));
  press(capSwitch, () => setCaptions(!captionsOn));
  press(fullBtn, toggleFull);
  press(filmsBtn, () => deps.picker());
  const onFull = () => { fullBtn.setAttribute("aria-pressed", String(!!document.fullscreenElement)); if (isOpen && !player.hidden) sync(); };

  // the scrubber: hover shows the shot, click or drag seeks to the start of the shot under the pointer
  const fracAt = (e: PointerEvent) => {
    const r = scrub.getBoundingClientRect();
    return r.width > 0 ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0;
  };
  scrub.addEventListener("pointermove", (e) => {
    const f = film();
    if (!f || f.shots.length === 0) return;
    const x = fracAt(e);
    const i = shotAtFraction(f, x);
    hoverChip.hidden = false;
    hoverChip.textContent = shotScrubLabel(i, f.shots[i]!);
    hoverChip.style.left = `${x * 100}%`;
    if (dragging) { const ms = seekFilmFraction(f, x); if (ms !== clock.ms) seek(ms); }
  });
  scrub.addEventListener("pointerleave", () => { if (!dragging) hoverChip.hidden = true; });
  scrub.addEventListener("pointerdown", (e) => {
    const f = film();
    if (!f || f.shots.length === 0) return;
    dragging = true;
    scrub.setPointerCapture(e.pointerId);
    seek(seekFilmFraction(f, fracAt(e)));
  });
  const drop = (e: PointerEvent) => {
    dragging = false;
    if (scrub.hasPointerCapture(e.pointerId)) scrub.releasePointerCapture(e.pointerId);
  };
  scrub.addEventListener("pointerup", drop);
  scrub.addEventListener("pointercancel", drop);
  root.addEventListener("pointerdown", () => { if (end && endCardActive(end)) { end = endCardCancel(end); drawEnd(); } }, true);

  const onKey = (e: KeyboardEvent) => {
    if (!isOpen) return;
    if (end && endCardActive(end)) { end = endCardCancel(end); drawEnd(); }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select")) return;
    const k = watchKey(e.key);
    if (!k) return;
    if (player.hidden && k !== "exit") return;
    if (k === "toggle" && e.target instanceof HTMLButtonElement) return; // a focused button handles Space itself
    e.preventDefault();
    if (k === "exit") return player.hidden ? deps.orbit() : deps.picker();
    const f = film();
    if (!f) return;
    if (k === "toggle") toggle();
    else if (k === "prev") seek(prevShotMs(f, clock.ms));
    else if (k === "next") { if (!end) seek(nextShotMs(f, clock.ms)); }
    else if (k === "captions") setCaptions(!captionsOn);
    else if (k === "fullscreen") toggleFull();
  };
  const onVisibility = () => {
    if (document.hidden) stop();
    else if (isOpen && !player.hidden && (clock.playing || (end && endCardActive(end)))) kick();
  };
  const onResize = () => { if (isOpen && !player.hidden) sync(); };

  // --- starting a film -----------------------------------------------------------------------------------------------------------
  function startFilm(i: number, atMs = 0) {
    const f = films[i];
    if (!f) return;
    stop();
    index = i;
    wantFilm = f.id;
    const tl = buildFilmTimeline(f);
    starts = tl.starts;
    totalMs = tl.total_ms;
    hideEnd();
    picker.hidden = true;
    player.hidden = false;
    shotEl.hidden = false;
    say(null);
    deps.moved(f.id);
    if (f.shots.length === 0) {
      bar.hidden = true;
      shotEl.hidden = true;
      return say("This film has no shots yet.");
    }
    bar.hidden = false;
    buildSegs();
    clock = { ...clock, ms: clampPlayhead(f, atMs), playing: true };
    const my = seq;
    void ensureView(my).then((v) => {
      if (my !== seq || index !== i || player.hidden) return;
      if (!v) say("This browser cannot draw 3D: WebGL 2 is turned off or missing.");
      sync();
      kick();
    });
  }

  function draw() {
    if (!isOpen) return;
    const reset = () => { stop(); hideEnd(); picker.hidden = true; player.hidden = true; index = -1; };
    if (!scene) { reset(); return; }
    if (films.length === 0) { reset(); return say("No films yet: ask Claude to add some"); }
    if (wantFilm === null) {
      reset();
      dropView(); // the picker frees the GPU; the player builds it again
      say(null);
      picker.hidden = false;
      drawPicker();
      picker.scrollTop = 0;
      void makePosters(seq);
      return;
    }
    const i = findFilm(films, wantFilm);
    if (i < 0) { reset(); return say("This film does not exist."); }
    if (i === index && !player.hidden) return;
    startFilm(i);
  }

  async function load(live: boolean) {
    const my = ++seq;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(pid)}/scenes/${encodeURIComponent(sid)}`, { headers: deps.headers() });
      if (my !== seq || !isOpen) return;
      if (res.status === 401) return deps.locked();
      if (res.status === 404) { scene = null; films = []; dropView(); stop(); picker.hidden = player.hidden = true; return say(`No scene "${sid}" in this project.`); }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { scene?: unknown; films?: unknown };
      if (my !== seq || !isOpen) return;
      scene = checkScene(body.scene);
      sceneSig = JSON.stringify(scene);
      ids = objectIds(scene);
      films = parseFilms(body.films);
      chipName.textContent = scene.name;
      if (live && !player.hidden && index >= 0) {
        const id = films[index]?.id === wantFilm ? index : findFilm(films, wantFilm);
        if (id < 0) { index = -1; return draw(); }
        const at = clock.ms, playing = clock.playing, ended = end !== null;
        startFilm(id, at); // rebuilds the view only when the scene changed
        if (!playing || ended) clock = { ...clock, playing: false };
        return;
      }
      draw();
    } catch (e) {
      if (my !== seq || !isOpen) return;
      if (!scene) say(`Could not load the scene: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    open(p, s, f) {
      const same = isOpen && p === pid && s === sid;
      if (!isOpen) {
        document.addEventListener("keydown", onKey);
        document.addEventListener("visibilitychange", onVisibility);
        document.addEventListener("fullscreenchange", onFull);
        window.addEventListener("resize", onResize);
      }
      isOpen = true;
      root.hidden = false;
      all = f !== null && armAll;
      armAll = false;
      wantFilm = f;
      modeSwitch(chipModes, "watch", p, s);
      if (same && scene) return draw();
      pid = p;
      sid = s;
      scene = null;
      films = [];
      index = -1;
      posters.clear();
      dropView();
      stop();
      picker.hidden = player.hidden = true;
      chipName.textContent = s;
      say("Loading the scene…");
      void load(false);
    },
    refetch() {
      if (isOpen) void load(true);
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      seq++;
      stop();
      hideEnd();
      dropView();
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFull);
      window.removeEventListener("resize", onResize);
      if (document.fullscreenElement) void document.exitFullscreen();
      picker.hidden = player.hidden = true;
      index = -1;
    },
  };
}
