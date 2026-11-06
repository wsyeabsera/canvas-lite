// Page mode of a 3D scene (`#/project/<id>/scene/<sid>/page`, docs/ui.md "Page mode"): the scene's renderer fixed full-window behind,
// a transparent scroll container on top, one sandboxed overlay frame per page section, and the camera driven by the scroll offset
// (cameraAt in web/page-scroll.ts). page.ts imports this module lazily; it imports Three.js lazily in turn. DOM only: the layout
// maths is pure in web/scene-page.ts.
//
// Safety: Claude-written overlay html is only ever put into `<iframe sandbox="" srcdoc>` (no allow-scripts, no allow-same-origin,
// referrerpolicy no-referrer). It never enters this page's DOM.
import type { Page } from "../src/page-model.ts";
import { checkScene, type Scene } from "../src/scene.ts";
import type { Film } from "../src/shots.ts";
import { cameraAt, sectionRanges } from "./page-scroll.ts";
import { activeSection, OVERLAY_SANDBOX, overlaySrcdoc, pageLayout, pageProgress, railDots, resolveFilmLooks } from "./scene-page.ts";
import { modeSwitch } from "./scene-view.ts";
import { scenePosterKey } from "./landing.ts";
import { hrefScene } from "./state.ts";
import { hasWebGL2 } from "./webgl.ts";
import type { SceneView } from "./scene-render.ts";

export interface ScenePageScreen {
  open(project: string, scene: string): void;
  /** A live `scene.set`, `films.set` or `page.set` for the scene on show: refetch and redraw, keeping the scroll position. */
  refetch(): void;
  close(): void;
}

type Deps = { headers: () => Record<string, string>; exit: (project: string, scene: string) => void; locked: () => void };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createScenePageScreen(host: HTMLElement, deps: Deps): ScenePageScreen {
  const stage = el("div", "pg-stage");
  const backdrop = el("div", "pg-backdrop"); // sky gradient or cached still when WebGL is missing
  const scroller = el("div", "pg-scroll");
  scroller.tabIndex = -1; // focused on open so arrow keys, Space and Page Down scroll it
  const track = el("div", "pg-track");
  scroller.append(track);
  const rail = el("nav", "pg-rail");
  rail.setAttribute("aria-label", "Sections");
  const chip = el("div", "sc-chip sc-g");
  const chipName = el("span", "sc-chip-n", "Scene");
  const chipMode = el("span", "sc-chip-m");
  const exitBtn = el("button", "sc-exit");
  exitBtn.type = "button";
  exitBtn.title = "Back to Orbit (Esc)";
  exitBtn.append("Exit ", el("kbd", undefined, "Esc"));
  chip.append(chipName, chipMode, exitBtn);
  const msg = el("div", "pg-msg");
  msg.hidden = true;
  const note = el("p", "sc-hint sc-g pg-note");
  note.hidden = true;
  host.replaceChildren(backdrop, stage, scroller, rail, chip, note, msg);
  exitBtn.addEventListener("click", () => deps.exit(pid, sid));

  let pid = "";
  let sid = "";
  let seq = 0;
  let open = false;
  let view: SceneView | null = null;
  let scene: Scene | null = null;
  let films: Film[] = [];
  let looked: Film[] = []; // films with look-at ids resolved to points
  let page: Page | null = null;
  let render: Promise<typeof import("./scene-render.ts")> | null = null;
  let raf = 0;
  let dots: HTMLElement[] = [];
  let fill: HTMLElement | null = null;
  let ranges: { start: number; end: number }[] = [];

  const dropView = () => {
    view?.dispose();
    view = null;
  };

  const showMsg = (title: string, body: string, orbitLink: boolean) => {
    const card = el("div", "pg-msg-card sc-g");
    card.append(el("h2", undefined, title), el("p", undefined, body));
    if (orbitLink) {
      const a = el("a", "pg-msg-btn", "Open in Orbit");
      a.href = hrefScene(pid, sid);
      card.append(a);
    }
    msg.replaceChildren(card);
    msg.hidden = false;
  };

  // --- camera ------------------------------------------------------------------------
  const update = () => {
    raf = 0;
    if (!open || !page) return;
    const y = scroller.scrollTop, h = scroller.clientHeight || innerHeight;
    if (view && scene) {
      const cam = cameraAt(page, looked, y, h);
      if (cam) view.setCamera({ pos: cam.pos, look: typeof cam.look === "string" ? view.lookPoint(cam.look) : cam.look, fov: scene.camera.fov });
    }
    const a = activeSection(ranges, y);
    dots.forEach((d, i) => d.classList.toggle("on", i === a));
    if (fill) fill.style.transform = `scaleY(${pageProgress(ranges, y)})`;
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  scroller.addEventListener("scroll", schedule, { passive: true });

  // --- overlays and rail -------------------------------------------------------------
  function layout() {
    if (!page) {
      track.replaceChildren();
      rail.replaceChildren();
      rail.hidden = true;
      dots = [];
      ranges = [];
      return;
    }
    const vh = scroller.clientHeight || innerHeight;
    const lay = pageLayout(page.sections, vh);
    ranges = sectionRanges(page.sections, vh);
    track.style.height = `${lay.track}px`;
    track.replaceChildren(
      ...lay.sections.map((s, i) => {
        const sec = el("section", `pg-sec ${s.align}`);
        sec.style.top = `${s.start}px`;
        sec.style.height = `${Math.max(1, s.end - s.start)}px`;
        sec.setAttribute("aria-label", s.title);
        const sticky = el("div", "pg-sticky");
        const card = el("div", "pg-card sc-g");
        card.style.height = `${s.card}px`;
        const f = el("iframe");
        f.setAttribute("sandbox", OVERLAY_SANDBOX); // empty: no scripts, no same-origin. Never add allow-scripts.
        f.referrerPolicy = "no-referrer";
        f.setAttribute("scrolling", "no");
        f.title = s.title;
        f.srcdoc = overlaySrcdoc(page!.sections[i].html);
        card.append(f);
        sticky.append(card);
        sec.append(sticky);
        return sec;
      }),
    );
    const at = railDots(ranges);
    const line = el("div", "pg-rail-line");
    fill = el("div", "pg-rail-fill");
    line.append(fill);
    dots = lay.sections.map((s, i) => {
      const b = el("button", "pg-dot");
      b.type = "button";
      b.style.top = `${at[i] * 100}%`;
      b.setAttribute("aria-label", s.title);
      b.append(el("span", "pg-dot-l", s.title));
      b.addEventListener("click", () => scroller.scrollTo({ top: Math.ceil(ranges[i].start) + 1, behavior: reducedMotion() ? "instant" : "smooth" }));
      return b;
    });
    rail.replaceChildren(line, ...dots);
    rail.hidden = dots.length === 0;
    schedule();
  }

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!open || !page) return;
      const old = ranges.length ? ranges[ranges.length - 1].end : 0;
      const frac = old > 0 ? scroller.scrollTop / old : 0;
      layout();
      const now = ranges.length ? ranges[ranges.length - 1].end : 0;
      scroller.scrollTop = frac * now; // keep the place in the page
    }, 120);
  };

  // --- data and renderer ------------------------------------------------------------
  function showBackdrop(data: Scene) {
    let src: string | null = null;
    try {
      src = localStorage.getItem(scenePosterKey(pid, sid));
    } catch {
      /* storage blocked */
    }
    backdrop.style.background = `linear-gradient(${data.sky.top}, ${data.sky.bottom})`;
    backdrop.replaceChildren();
    if (src) {
      const img = el("img");
      img.alt = "";
      img.src = src;
      backdrop.append(img);
    }
    backdrop.hidden = false;
  }

  async function mount(data: Scene, my: number, rebuild: boolean) {
    if (!hasWebGL2()) {
      dropView();
      showBackdrop(data);
      note.textContent = "This browser cannot draw 3D (no WebGL 2): the camera does not move, the text still scrolls.";
      note.hidden = false;
      return;
    }
    try {
      const m = await (render ??= import("./scene-render.ts"));
      if (my !== seq || !open) return;
      if (rebuild || !view) {
        dropView();
        view = m.createSceneView(stage, data);
      }
      const v = view;
      looked = resolveFilmLooks(films, (id) => v.lookPoint(id));
      backdrop.hidden = true;
      note.hidden = true;
      if (!page) v.setCamera(data.camera);
      schedule();
    } catch (e) {
      if (my !== seq) return;
      dropView();
      render = null;
      showBackdrop(data);
      note.textContent = `The 3D view could not start: ${e instanceof Error ? e.message : String(e)}`;
      note.hidden = false;
    }
  }

  async function load(first: boolean) {
    const my = ++seq;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(pid)}/scenes/${encodeURIComponent(sid)}`, { headers: deps.headers() });
      if (my !== seq || !open) return;
      if (res.status === 401) return deps.locked();
      if (res.status === 404) {
        dropView();
        page = null;
        layout();
        return showMsg("No such scene", `No scene "${sid}" in this project.`, false);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { scene?: unknown; films?: Film[]; page?: Page | null };
      if (my !== seq || !open) return;
      const next = checkScene(body.scene);
      const sceneChanged = !scene || JSON.stringify(next) !== JSON.stringify(scene);
      scene = next;
      films = Array.isArray(body.films) ? body.films : [];
      looked = films;
      const nextPage = body.page && Array.isArray(body.page.sections) && body.page.sections.length > 0 ? body.page : null;
      const pageChanged = JSON.stringify(nextPage) !== JSON.stringify(page);
      page = nextPage;
      chipName.textContent = scene.name;
      if (!page) showMsg("No page yet", "This scene has no page yet. Ask Claude to add one with set_page.", true);
      else msg.hidden = true;
      if (pageChanged || first) {
        const keep = scroller.scrollTop;
        layout();
        scroller.scrollTop = first ? 0 : keep;
      }
      await mount(scene, my, sceneChanged);
    } catch (e) {
      if (my !== seq || !open) return;
      showMsg("Could not load the scene", e instanceof Error ? e.message : String(e), false);
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (!open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      deps.exit(pid, sid);
    }
  };

  return {
    open(p, s) {
      if (open && p === pid && s === sid) return;
      if (!open) {
        document.addEventListener("keydown", onKey);
        addEventListener("resize", onResize);
      }
      open = true;
      pid = p;
      sid = s;
      scene = null;
      page = null;
      films = looked = [];
      dropView();
      layout();
      chipName.textContent = s;
      modeSwitch(chipMode, "page", p, s);
      msg.hidden = true;
      note.hidden = true;
      backdrop.hidden = true;
      scroller.scrollTop = 0;
      scroller.focus({ preventScroll: true });
      void load(true);
    },
    refetch() {
      if (open) void load(false);
    },
    close() {
      if (!open) return;
      open = false;
      seq++;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(resizeTimer);
      document.removeEventListener("keydown", onKey);
      removeEventListener("resize", onResize);
      dropView();
      page = null;
      layout(); // drop the overlay frames
      msg.hidden = true;
    },
  };
}
