// The canvas view: one full-screen surface, screens at their real size on a world moved by one CSS transform.
// DOM only; the math lives in viewport.ts and layout.ts, the diffing in canvas.ts (all unit-tested).
import { hrefLanding } from "./state.ts";
import { stateBlock } from "./states-view.ts";
import { diffScreens, iframeSpec, stepScreen, writingText, type CanvasDetail, type Pending, type Screen, type Shown } from "./canvas.ts";
import { layoutScreens, type Box } from "./layout.ts";
import { boundsOf, fitRect, minimap, panBy, pct, stepZoom, viewFromMap, wheelZoomFactor, zoomAt, zoomTo, type View } from "./viewport.ts";

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
export function createCanvasView(select: (id: string | null) => void, play: () => void, walk: () => void = () => {}, watch: () => void = () => {}) {
  const $ = (id: string) => document.getElementById(id)!;
  const surface = $("cv-surface");
  const world = $("cv-world");
  const note = $("cv-note");
  const crumb = $("cv-crumb");
  const back = $("cv-back") as HTMLAnchorElement;
  const writing = $("cv-writing");
  const pctBtn = $("cv-pct");
  const watchBtn = $("cv-watch") as HTMLButtonElement;

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
    drawMap();
  }

  // The overview map (bottom left): the screens as small boxes and the visible area; a click or drag moves the view there.
  const mapEl = $("cv-map");
  const mapView = el("div", "cv-map-view");
  const MAP = { w: 180, h: 112 };
  let mapGeo: ReturnType<typeof minimap> = null;
  function drawMap() {
    mapGeo = boxes.length > 4 ? minimap(boxes, view, { w: surface.clientWidth, h: surface.clientHeight }, MAP) : null;
    mapEl.hidden = !mapGeo;
    if (!mapGeo) return;
    if (mapEl.children.length !== boxes.length + 1) {
      mapEl.replaceChildren(...boxes.map(() => el("i")), mapView);
    }
    mapGeo.rects.forEach((r, i) => {
      const d = mapEl.children[i] as HTMLElement;
      d.style.cssText = `left:${r.x}px;top:${r.y}px;width:${Math.max(1, r.w)}px;height:${Math.max(1, r.h)}px`;
    });
    const v = mapGeo.view;
    mapView.style.cssText = `left:${v.x}px;top:${v.y}px;width:${v.w}px;height:${v.h}px`;
  }
  function mapTo(ev: PointerEvent) {
    if (!mapGeo) return;
    const r = mapEl.getBoundingClientRect();
    view = viewFromMap(mapGeo, ev.clientX - r.left, ev.clientY - r.top, view, { w: surface.clientWidth, h: surface.clientHeight });
    world.classList.remove("anim");
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    drawMapOnly();
  }
  /** While dragging the map keeps its scale (so it does not move under the pointer); only the visible box follows. */
  const drawMapOnly = () => {
    const g = mapGeo;
    if (!g) return;
    const w = surface.clientWidth / view.k * g.scale, h = surface.clientHeight / view.k * g.scale;
    mapView.style.cssText = `left:${-view.x / view.k * g.scale + g.ox}px;top:${-view.y / view.k * g.scale + g.oy}px;width:${w}px;height:${h}px`;
  };
  mapEl.addEventListener("pointerdown", (ev) => {
    mapEl.setPointerCapture(ev.pointerId);
    mapTo(ev);
  });
  mapEl.addEventListener("pointermove", (ev) => {
    if (mapEl.hasPointerCapture(ev.pointerId)) mapTo(ev);
  });
  mapEl.addEventListener("pointerup", drawMap); // settle the scale again

  /** Fits one screen when `id` is laid out, otherwise every screen. */
  function fit(id: string | null, animate: boolean) {
    const one = id ? boxes.find((b) => b.id === id) : undefined;
    const b = one ?? boundsOf(boxes);
    if (!b) return;
    view = fitRect(b, { w: surface.clientWidth, h: surface.clientHeight }, FIT_PADDING); // room for the islands and the label row
    apply(animate);
  }

  const fitAll = () => (input?.selected ? select(null) : fit(null, true));
  const zoomBy = (dir: 1 | -1) => {
    const c = centre();
    view = zoomTo(view, stepZoom(view.k, dir), c.x, c.y);
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
    nm.title = s.name;
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
    const has = (next.detail?.scenarios.length ?? 0) > 0;
    watchBtn.disabled = !has;
    watchBtn.hidden = !has; // nothing to watch: no dead button
    watchBtn.title = has ? "Watch a scenario (V)" : "No scenarios yet: ask Claude to add some";
    back.href = hrefLanding;
    crumb.replaceChildren(el("span", "cp", next.projectName), el("span", "cs", "/"), el("span", "cn", next.canvasName));

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
    jump.replaceChildren(Object.assign(el("option", undefined, `Go to screen (${screens.length})`), { value: "" }), ...screens.map((sc) => Object.assign(el("option", undefined, sc.name), { value: sc.id })));
    jump.value = next.selected ?? "";
    classes();

    const wtext = writingText(next.pending);
    writing.hidden = !wtext;
    writing.textContent = wtext ?? "";
    const dead = next.state === "missing" || (next.state === "error" && !next.detail);
    $("view-canvas").classList.toggle("cv-dead", dead); // nothing to play or zoom: the tools hide
    const toDesigns = { label: "Back to designs", href: hrefLanding };
    const block =
      next.state === "missing" ? stateBlock("missing", "design", [toDesigns])
      : next.state === "error" && !next.detail ? stateBlock("error", "design", [{ label: "Try again", onClick: () => location.reload() }, toDesigns])
      : !next.detail ? stateBlock("loading", "design")
      : screens.length === 0 && !wtext ? stateBlock("empty", "design", [], { title: "Waiting for Claude to set the first screen", hint: "" })
      : null;
    note.hidden = !block;
    note.replaceChildren(...(block ? [block] : []));
    drawMap();

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
    if (!active || e.altKey || e.ctrlKey || e.metaKey || helpDlg.open) return;
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
        zoomBy(1);
        break;
      case "-":
      case "_":
        zoomBy(-1);
        break;
      case "?":
        if (!helpDlg.open) helpDlg.showModal(); // modal: focus stays inside and Escape closes it
        break;
      case "p":
      case "P":
        play();
        break;
      case "w":
      case "W":
        walk();
        break;
      case "v":
      case "V":
        if (watchBtn.disabled) return;
        watch();
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
  const jump = $("cv-jump") as HTMLSelectElement;
  jump.addEventListener("change", () => {
    if (jump.value) goTo(jump.value);
    jump.blur(); // keep the arrow keys for screen stepping
  });
  const helpDlg = $("cv-help") as HTMLDialogElement;
  $("cv-keys").addEventListener("click", () => helpDlg.showModal());
  helpDlg.addEventListener("click", (ev) => ev.target === helpDlg && helpDlg.close());
  $("cv-out").addEventListener("click", () => zoomBy(-1));
  $("cv-in").addEventListener("click", () => zoomBy(1));
  pctBtn.addEventListener("click", actual);
  $("cv-fit").addEventListener("click", fitAll);
  $("cv-play").addEventListener("click", play);
  $("cv-walk").addEventListener("click", walk);
  watchBtn.addEventListener("click", watch);
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
    /** Play, Walkthrough and Watch sit over the canvas: its controls leave the tab order and the accessibility tree, so the keyboard stays on the mode that is on top. */
    setCovered(on: boolean) {
      for (const e of document.querySelectorAll<HTMLElement>("#cv-surface, #view-canvas > .island:not(.pl-bar), #cv-note")) e.inert = on;
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
