// The replay view: the canvas as it was at the scrubbed event, plus a glass bar. DOM only; the logic (event index, stepping,
// playback timing, ticks, labels) is in replay.ts and unit-tested. Frames use the same sandboxed iframe spec as the canvas.
import { diffScreens, iframeSpec, type Shown } from "./canvas.ts";
import { boundsOf, fitRect, type View } from "./viewport.ts";
import {
  asScreens, describeAt, describeTimeline, eventLabel, indexFromFraction, justAdded, playStart, replayKey, SPEEDS, stepDelay, stepIndex, tickNames, tickPositions,
  type AtState, type Speed, type TimelineEvent,
} from "./replay.ts";

const FIT_PADDING = 130; // room for the pill on top and the bar below

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const icon = (d: string, size = 16) => {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: String(size), height: String(size), fill: "currentColor", "aria-hidden": "true" })) s.setAttribute(k, v);
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", d);
  s.append(p);
  return s;
};
const PLAY = "M8 5v14l11-7z";
const PAUSE = "M7 5h4v14H7zM13 5h4v14h-4z";
const PREV = "M7 6h2v12H7zM20 6v12L10 12z";
const NEXT = "M15 6h2v12h-2zM4 6l10 6L4 18z";

type Frame = { root: HTMLElement; frame: HTMLIFrameElement; nm: HTMLElement; chip: HTMLElement | null; shown: Shown };

/** `headers()` gives the same auth headers the page's other fetches use. */
export function createReplayView(headers: () => Record<string, string>) {
  const host = document.getElementById("view-canvas")!;
  const surface = document.getElementById("cv-surface")!;
  const layer = el("div", "rp-layer");
  const world = el("div", "rp-world");
  const note = el("p", "rp-note");
  layer.append(world, note);
  layer.hidden = true;

  const pill = el("div", "island glass rp-pill");
  pill.append(el("span", "rp-dot"), el("strong", undefined, "Replaying design"), el("span", "rp-hint", "Left and Right arrows step one change · Space plays"));
  pill.hidden = true;

  const bar = el("div", "island glass rp-bar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Replay");
  const btn = (cls: string, label: string, d: string) => {
    const b = el("button", cls);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.append(icon(d));
    return b;
  };
  const prevB = btn("ib", "Previous change", PREV);
  const playB = btn("ib rp-play", "Play", PLAY);
  const nextB = btn("ib", "Next change", NEXT);
  const track = el("div", "rp-track");
  track.setAttribute("role", "slider");
  track.setAttribute("aria-label", "Replay position");
  track.tabIndex = 0;
  const names = el("div", "rp-names");
  const rail = el("div", "rp-rail");
  const fill = el("div", "rp-fill");
  const ticks = el("div", "rp-ticks");
  const thumb = el("div", "rp-thumb");
  rail.append(fill, ticks, thumb);
  track.append(names, rail);
  const label = el("span", "rp-label", "Loading…");
  const speedG = el("div", "rp-speed");
  speedG.setAttribute("role", "group");
  speedG.setAttribute("aria-label", "Speed");
  const speedBs = SPEEDS.map((s) => {
    const b = el("button", "rp-sp", `${s}×`);
    b.type = "button";
    b.addEventListener("click", () => setSpeed(s));
    speedG.append(b);
    return b;
  });
  const exitB = el("button", "rp-exit", "Exit");
  exitB.type = "button";
  bar.append(prevB, playB, nextB, track, label, speedG, exitB);
  bar.hidden = true;

  surface.after(layer);
  host.append(pill, bar);

  const frames = new Map<string, Frame>();
  const cache = new Map<number, Promise<AtState>>();
  let events: TimelineEvent[] = [];
  let index = 0;
  let speed: Speed = 1;
  let playing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run = 0; // bumped on open and close: late answers of an older replay are dropped
  let shownToken = 0;
  let base = "";
  let allBounds: ReturnType<typeof boundsOf> = null;
  let current: AtState | null = null;
  let open = false;

  const fetchAt = (seq: number): Promise<AtState> => {
    let p = cache.get(seq);
    if (!p) {
      p = fetch(`${base}/at/${seq}`, { headers: headers() }).then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return describeAt(await r.json());
      });
      p.catch(() => cache.delete(seq));
      cache.set(seq, p);
    }
    return p;
  };

  function applyView() {
    const boxes = current?.screens.map((s) => s.box) ?? [];
    const b = allBounds ?? boundsOf(boxes);
    if (!b) return;
    const v: View = fitRect(b, { w: layer.clientWidth, h: layer.clientHeight }, FIT_PADDING);
    world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
    world.style.setProperty("--k", String(v.k));
  }

  function draw(at: AtState, justId: string | null) {
    current = at;
    const screens = asScreens(at);
    const d = diffScreens(new Map([...frames].map(([id, f]) => [id, f.shown])), screens);
    for (const id of d.remove) {
      frames.get(id)?.root.remove();
      frames.delete(id);
    }
    const changed = new Set(d.changed), html = new Set(d.html);
    for (const s of screens) {
      let f = frames.get(s.id);
      if (!f) {
        const spec = iframeSpec(s);
        const root = el("div", "scr rp-in");
        const lbl = el("div", "lbl");
        const nm = el("span", "nm", s.name);
        lbl.append(nm, el("span", "dim", `${s.width} × ${s.height}`));
        const box = el("div", "frame");
        const fr = document.createElement("iframe");
        fr.setAttribute("sandbox", spec.sandbox); // empty: no scripts, forms or same-origin access
        fr.setAttribute("referrerpolicy", spec.referrerpolicy);
        fr.setAttribute("loading", spec.loading);
        fr.title = spec.title;
        fr.srcdoc = spec.srcdoc; // a property: the html is never parsed into this page
        fr.tabIndex = -1;
        box.append(fr);
        root.append(lbl, box);
        world.append(root);
        f = { root, frame: fr, nm, chip: null, shown: { updated_at: s.updated_at, html: s.html } };
        frames.set(s.id, f);
      } else {
        if (changed.has(s.id)) f.nm.textContent = s.name;
        if (html.has(s.id)) f.frame.srcdoc = s.html;
        f.shown = { updated_at: s.updated_at, html: s.html };
      }
    }
    for (const s of at.screens) {
      const f = frames.get(s.id)!;
      f.root.style.left = `${s.box.x}px`;
      f.root.style.top = `${s.box.y}px`;
      f.root.style.width = `${s.box.w}px`;
      f.root.style.height = `${s.box.h}px`;
      f.root.style.setProperty("--fw", String(s.box.w));
      const just = s.id === justId;
      f.root.classList.toggle("just", just);
      if (just && !f.chip) {
        f.chip = el("span", "rp-chip", "just added");
        f.nm.after(f.chip);
      } else if (!just && f.chip) {
        f.chip.remove();
        f.chip = null;
      }
    }
    note.hidden = at.screens.length > 0;
    note.textContent = "Nothing on the canvas yet";
    applyView();
  }

  function paintBar(ts: number | null) {
    const total = events.length;
    label.textContent = eventLabel(index, total, ts);
    const f = tickPositions(total)[index] ?? 0;
    fill.style.width = `${f * 100}%`;
    thumb.style.left = `${f * 100}%`;
    track.setAttribute("aria-valuemin", "1");
    track.setAttribute("aria-valuemax", String(total));
    track.setAttribute("aria-valuenow", String(index + 1));
    prevB.disabled = index <= 0;
    nextB.disabled = index >= total - 1;
    playB.disabled = total === 0;
    playB.replaceChildren(icon(playing ? PAUSE : PLAY));
    playB.setAttribute("aria-label", playing ? "Pause" : "Play");
    playB.title = playing ? "Pause" : "Play";
    speedBs.forEach((b, i) => b.setAttribute("aria-pressed", String(SPEEDS[i] === speed)));
  }

  async function show(i: number) {
    index = i;
    const mine = ++shownToken, r = run;
    paintBar(events[i]?.ts ?? null);
    if (!events[i]) return;
    let at: AtState;
    try {
      at = await fetchAt(events[i].seq);
    } catch {
      if (mine === shownToken && r === run) {
        pause();
        note.hidden = false;
        note.textContent = "Could not load this step";
      }
      return;
    }
    if (mine !== shownToken || r !== run) return;
    draw(at, justAdded(events, i));
    if (events[i + 1]) void fetchAt(events[i + 1].seq).catch(() => undefined); // warm the next step
    if (playing) schedule();
  }

  function schedule() {
    clearTimeout(timer);
    const delay = stepDelay(events, index, speed);
    if (delay === null) {
      playing = false;
      paintBar(events[index]?.ts ?? null);
      return;
    }
    timer = setTimeout(() => void show(index + 1), delay);
  }

  function pause() {
    playing = false;
    clearTimeout(timer);
    paintBar(events[index]?.ts ?? null);
  }
  function play() {
    if (events.length === 0) return;
    playing = true;
    const start = playStart(index, events.length);
    if (start !== index) void show(start);
    else schedule();
    paintBar(events[index]?.ts ?? null);
  }
  function setSpeed(s: Speed) {
    speed = s;
    if (playing) schedule();
    paintBar(events[index]?.ts ?? null);
  }
  function go(i: number) {
    pause();
    void show(i);
  }

  prevB.addEventListener("click", () => go(stepIndex(index, events.length, -1)));
  nextB.addEventListener("click", () => go(stepIndex(index, events.length, 1)));
  playB.addEventListener("click", () => (playing ? pause() : play()));
  exitB.addEventListener("click", () => close());
  const scrub = (e: PointerEvent) => {
    const r = rail.getBoundingClientRect();
    go(indexFromFraction((e.clientX - r.left) / Math.max(1, r.width), events.length));
  };
  let scrubbing = false;
  track.addEventListener("pointerdown", (e) => {
    scrubbing = true;
    track.setPointerCapture(e.pointerId);
    scrub(e);
  });
  track.addEventListener("pointermove", (e) => scrubbing && scrub(e));
  const endScrub = () => (scrubbing = false);
  track.addEventListener("pointerup", endScrub);
  track.addEventListener("pointercancel", endScrub);
  window.addEventListener("resize", () => open && applyView());
  // Capture phase: while replaying, the canvas view's own keys (arrows step screens, Escape fits) must not also fire.
  window.addEventListener(
    "keydown",
    (e) => {
      if (!open || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (t && t.tagName === "BUTTON" && e.key === " ") return; // a focused button keeps its own activation
      const a = replayKey(e.key);
      if (!a) {
        if (["0", "1", "+", "=", "-", "_"].includes(e.key)) e.stopImmediatePropagation();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (a === "prev") go(stepIndex(index, events.length, -1));
      else if (a === "next") go(stepIndex(index, events.length, 1));
      else if (a === "toggle") (playing ? pause() : play());
      else close();
    },
    true,
  );

  function buildScrubber() {
    ticks.replaceChildren(...tickPositions(events.length).map((f) => {
      const t = el("span", "rp-tick");
      t.style.left = `${f * 100}%`;
      return t;
    }));
    const pos = tickPositions(events.length);
    names.replaceChildren(...tickNames(events).map((n) => {
      const s = el("span", "rp-name", n.name);
      s.style.left = `${(pos[n.index] ?? 0) * 100}%`;
      return s;
    }));
  }

  function close() {
    if (!open) return;
    open = false;
    run++;
    pause();
    clearTimeout(timer);
    layer.hidden = pill.hidden = bar.hidden = true;
    host.classList.remove("replaying");
    for (const f of frames.values()) f.root.remove();
    frames.clear();
    cache.clear();
    events = [];
    current = null;
    allBounds = null;
  }

  async function openReplay(pid: string, cid: string) {
    close();
    open = true;
    const r = ++run;
    base = `/api/projects/${pid}/canvases/${cid}`;
    events = [];
    index = 0;
    playing = false;
    layer.hidden = pill.hidden = bar.hidden = false;
    host.classList.add("replaying");
    note.hidden = false;
    note.textContent = "Loading…";
    label.textContent = "Loading…";
    ticks.replaceChildren();
    names.replaceChildren();
    paintBar(null);
    try {
      const res = await fetch(`${base}/timeline`, { headers: headers() });
      if (!res.ok) throw new Error(String(res.status));
      const list = describeTimeline(await res.json());
      if (r !== run) return;
      events = list;
      if (list.length === 0) {
        note.textContent = "Nothing to replay yet";
        paintBar(null);
        return;
      }
      const last = await fetchAt(list[list.length - 1].seq); // fixes the view, so it does not jump as screens appear
      if (r !== run) return;
      allBounds = boundsOf(last.screens.map((s) => s.box));
      buildScrubber();
      await show(0);
    } catch {
      if (r !== run) return;
      note.hidden = false;
      note.textContent = "Could not load the timeline";
      label.textContent = "Could not load";
    }
  }

  return { open: openReplay, close, get isOpen() { return open; } };
}
