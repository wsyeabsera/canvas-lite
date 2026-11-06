// The canvas view: one full-screen surface, screens at their real size on a world moved by one CSS transform.
// DOM only; the math lives in viewport.ts and layout.ts, the diffing in canvas.ts (all unit-tested).
import { hrefLanding } from "./state.ts";
import { diffScreens, iframeSpec, stepScreen, writingText, type CanvasDetail, type Pending, type Screen, type Shown } from "./canvas.ts";
import { layoutScreens, type Box } from "./layout.ts";
import { boundsOf, fitRect, panBy, pct, wheelZoomFactor, zoomAt, zoomTo, ZOOM_STEP, type View } from "./viewport.ts";

/** Fit padding in px: leaves room for the floating islands and the label row above the first screens. */
const FIT_PADDING = 120;

export type CanvasInput = {
  pid: string;
  projectName: string;
  canvasName: string;
  detail: CanvasDetail | null;
  state: "loading" | "ok" | "missing" | "error";
  pending: ReadonlyMap<string, Pending>;
  selected: string | null; // the screen of a screen route
};

type Frame = { root: HTMLElement; frame: HTMLIFrameElement; nm: HTMLElement; dim: HTMLElement; shown: Shown };

const RECENT_MS = 6000;
const ANIM_MS = 260; // a little over the CSS transition

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const dims = (s: { width: number; height: number }) => `${s.width} × ${s.height}`;

/** `select(id)` moves to a screen's route (null: the canvas route); `play()` opens present mode (the Play pill, key P); the page owns the hash. */
export function createCanvasView(select: (id: string | null) => void, play: () => void, walk: () => void = () => {}) {
  const $ = (id: string) => document.getElementById(id)!;
  const surface = $("cv-surface");
  const world = $("cv-world");
  const note = $("cv-note");
  const crumb = $("cv-crumb");
  const back = $("cv-back") as HTMLAnchorElement;
  const writing = $("cv-writing");
  const pctBtn = $("cv-pct");

  const frames = new Map<string, Frame>();
  let boxes: Box[] = [];
  let input: CanvasInput | null = null;
  let view: View = { x: 0, y: 0, k: 1 };
  let active = false;
  let needFit = false;
  let fitAnimated = false;
  let drag: { id: number; x: number; y: number } | null = null;
  let animTimer: ReturnType<typeof setTimeout> | undefined;
  let recentId: string | null = null;
  let recentTimer: ReturnType<typeof setTimeout> | undefined;

  const centre = () => ({ x: surface.clientWidth / 2, y: surface.clientHeight / 2 });

  function apply(animate: boolean) {
    clearTimeout(animTimer);
    world.classList.toggle("anim", animate && !drag);
    if (animate) animTimer = setTimeout(() => world.classList.remove("anim"), ANIM_MS);
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    world.style.setProperty("--k", String(view.k));
    pctBtn.textContent = pct(view.k);
  }

  /** Fits one screen when `id` is laid out, otherwise every screen. */
  function fit(id: string | null, animate: boolean) {
    const one = id ? boxes.find((b) => b.id === id) : undefined;
    const b = one ?? boundsOf(boxes);
    if (!b) return;
    view = fitRect(b, { w: surface.clientWidth, h: surface.clientHeight }, FIT_PADDING); // room for the islands and the label row
    apply(animate);
  }

  const fitAll = () => (input?.selected ? select(null) : fit(null, true));
  const zoomBy = (f: number) => {
    const c = centre();
    view = zoomAt(view, f, c.x, c.y);
    apply(true);
  };
  const actual = () => {
    const c = centre();
    view = zoomTo(view, 1, c.x, c.y);
    apply(true);
  };
  const goTo = (id: string) => (input?.selected === id ? fit(id, true) : select(id));

  function makeFrame(s: Screen): Frame {
    const spec = iframeSpec(s);
    const root = el("div", "scr");
    root.dataset.id = s.id;
    const lbl = el("div", "lbl");
    const nm = el("span", "nm", s.name);
    const dim = el("span", "dim", dims(s));
    lbl.append(nm, dim);
    const box = el("div", "frame");
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", spec.sandbox); // empty: no scripts, forms or same-origin access
    f.setAttribute("referrerpolicy", spec.referrerpolicy);
    f.setAttribute("loading", spec.loading);
    f.title = spec.title;
    f.srcdoc = spec.srcdoc; // a property: the html is never parsed into this page
    f.tabIndex = -1;
    box.append(f);
    root.append(lbl, box);
    world.append(root);
    return { root, frame: f, nm, dim, shown: { updated_at: s.updated_at, html: s.html } };
  }

  function classes() {
    for (const [id, f] of frames) {
      f.root.classList.toggle("sel", id === input?.selected);
      f.root.classList.toggle("recent", id === recentId);
    }
  }

  function render(next: CanvasInput) {
    input = next;
    back.href = hrefLanding;
    crumb.replaceChildren(el("span", "cn", next.canvasName));

    const screens = next.detail?.screens ?? [];
    const d = diffScreens(new Map([...frames].map(([id, f]) => [id, f.shown])), screens);
    for (const id of d.remove) {
      frames.get(id)?.root.remove();
      frames.delete(id);
    }
    const changed = new Set(d.changed), html = new Set(d.html);
    for (const s of screens) {
      let f = frames.get(s.id);
      if (!f) {
        f = makeFrame(s);
        frames.set(s.id, f);
      } else {
        if (changed.has(s.id)) {
          f.nm.textContent = s.name;
          f.dim.textContent = dims(s);
          f.frame.title = s.name;
        }
        if (html.has(s.id)) f.frame.srcdoc = s.html; // only this frame reloads
        f.shown = { updated_at: s.updated_at, html: s.html };
      }
    }
    boxes = layoutScreens(screens);
    for (const b of boxes) {
      const r = frames.get(b.id)!.root;
      r.style.left = `${b.x}px`;
      r.style.top = `${b.y}px`;
      r.style.width = `${b.w}px`;
      r.style.height = `${b.h}px`;
      r.style.setProperty("--fw", String(b.w));
    }
    classes();

    const wtext = writingText(next.pending);
    writing.hidden = !wtext;
    writing.textContent = wtext ?? "";
    const msg =
      next.state === "missing" ? "This canvas does not exist or was removed."
      : next.state === "error" && !next.detail ? "Could not load this canvas."
      : !next.detail ? "Loading…"
      : screens.length === 0 && !wtext ? "Waiting for Claude to set the first screen"
      : null;
    note.hidden = !msg;
    note.textContent = msg ?? "";

    if (needFit && boxes.length > 0) {
      needFit = false;
      fit(next.selected, fitAnimated);
    }
  }

  function reset() {
    for (const f of frames.values()) f.root.remove();
    frames.clear();
    boxes = [];
    view = { x: 0, y: 0, k: 1 };
    apply(false);
  }

  // --- input --------------------------------------------------------------
  surface.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    surface.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    world.classList.remove("anim");
    surface.classList.add("grabbing");
  });
  surface.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    view = panBy(view, e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
    apply(false);
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    surface.classList.remove("grabbing");
  };
  surface.addEventListener("pointerup", endDrag);
  surface.addEventListener("pointercancel", endDrag);
  surface.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? surface.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) {
        const r = surface.getBoundingClientRect();
        view = zoomAt(view, wheelZoomFactor(e.deltaY * unit), e.clientX - r.left, e.clientY - r.top);
      } else view = panBy(view, -e.deltaX * unit, -e.deltaY * unit);
      apply(false);
    },
    { passive: false },
  );
  surface.addEventListener("dblclick", (e) => {
    // with pointer capture the event targets the surface itself, so look up what is under the cursor
    const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const id = hit?.closest<HTMLElement>(".scr")?.dataset.id;
    if (id) goTo(id);
  });
  window.addEventListener("keydown", (e) => {
    if (!active || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    switch (e.key) {
      case "0":
      case "Escape":
        fitAll();
        break;
      case "1":
        actual();
        break;
      case "+":
      case "=":
        zoomBy(ZOOM_STEP);
        break;
      case "-":
      case "_":
        zoomBy(1 / ZOOM_STEP);
        break;
      case "p":
      case "P":
        play();
        break;
      case "w":
      case "W":
        walk();
        break;
      case "ArrowLeft":
      case "ArrowRight": {
        const id = stepScreen(input?.detail?.screens ?? [], input?.selected ?? null, e.key === "ArrowRight" ? 1 : -1);
        if (id) goTo(id);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  });
  $("cv-out").addEventListener("click", () => zoomBy(1 / ZOOM_STEP));
  $("cv-in").addEventListener("click", () => zoomBy(ZOOM_STEP));
  pctBtn.addEventListener("click", actual);
  $("cv-fit").addEventListener("click", fitAll);
  $("cv-play").addEventListener("click", play);
  $("cv-walk").addEventListener("click", walk);
  apply(false);

  return {
    render,
    /** The view is shown for a (new) route: fit on the next render with screens; animate when the canvas stayed the same. */
    enter(sameCanvas: boolean) {
      active = true;
      needFit = true;
      fitAnimated = sameCanvas && frames.size > 0;
      if (!sameCanvas) reset();
    },
    /** Play covers the canvas: its keys stop but the view (pan, zoom, frames) stays as it was. */
    pause() {
      active = false;
    },
    /** Back from play to the same canvas: nothing is refitted. */
    resume() {
      active = true;
    },
    leave() {
      active = false;
      needFit = false;
      input = null;
      reset();
    },
    /** A screen.set just arrived: its name gets the accent dot for a few seconds. */
    markRecent(id: string) {
      recentId = id;
      clearTimeout(recentTimer);
      recentTimer = setTimeout(() => {
        recentId = null;
        classes();
      }, RECENT_MS);
      classes();
    },
  };
}
