// Orbit mode for a 3D scene (`#/project/<id>/scene/<sid>`, docs/ui.md "Scenes"): fetches the scene, mounts the renderer
// (web/scene-render.ts, imported lazily so Three.js loads only here) and turns drag, wheel and shift/right-drag into orbit, zoom
// and pan. page.ts imports this module lazily too. DOM only; the orbit maths is pure in web/scene-math.ts.
import { checkScene, type Scene } from "../src/scene.ts";
import { fromOrbit, orbitPan, orbitRotate, orbitZoom, toOrbit, type Orbit } from "./scene-math.ts";
import { hasWebGL2 } from "./webgl.ts";
import type { SceneView } from "./scene-render.ts";
import { scenePosterKey } from "./landing.ts";
import { hrefScene, hrefScenePage } from "./state.ts";

/** The scene modes of the chip's segmented control, in order (one line each; Watch adds itself here). */
export const MODES: readonly { id: string; label: string; href: (project: string, scene: string) => string }[] = [
  { id: "orbit", label: "Orbit", href: hrefScene },
  { id: "page", label: "Page", href: hrefScenePage },
];

/** The `Orbit | Page` segmented control for the scene chip; `current` is the mode on show (aria-current). */
export function modeSegments(project: string, scene: string, current: string): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "sc-modes";
  nav.setAttribute("aria-label", "Scene mode");
  for (const m of MODES) {
    const a = document.createElement("a");
    a.className = "sc-mode";
    a.textContent = m.label;
    a.href = m.href(project, scene);
    if (m.id === current) a.setAttribute("aria-current", "page");
    nav.append(a);
  }
  return nav;
}

export interface SceneScreen {
  /** Shows a scene (fetches it); opening the one already shown does nothing. */
  open(project: string, scene: string): void;
  /** Refetches the open scene (a live `scene.set` or `films.set`), keeping the viewer's camera. */
  refetch(): void;
  /** Frees the renderer and stops listening to keys. */
  close(): void;
}

type Deps = { headers: () => Record<string, string>; exit: () => void; locked: () => void };

const POSTER_KEY = scenePosterKey;
const POSTER_WIDTH = 480;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createSceneScreen(host: HTMLElement, deps: Deps): SceneScreen {
  const stage = el("div", "sc-stage");
  const chip = el("div", "sc-chip sc-g");
  const chipName = el("span", "sc-chip-n", "Scene");
  let chipMode: HTMLElement = el("span", "sc-chip-m", "Orbit"); // replaced by the mode segments once a scene opens
  const exitBtn = el("button", "sc-exit");
  exitBtn.type = "button";
  exitBtn.title = "Back to designs (Esc)";
  exitBtn.append("Exit ", el("kbd", undefined, "Esc"));
  chip.append(chipName, chipMode, exitBtn);
  const hint = el("p", "sc-hint sc-g", "Drag to orbit · Scroll to zoom · Shift-drag or right-drag to pan · R resets");
  const msg = el("div", "sc-msg");
  msg.hidden = true;
  host.replaceChildren(stage, chip, hint, msg);
  exitBtn.addEventListener("click", () => deps.exit());

  let pid = "";
  let sid = "";
  let seq = 0;
  let open = false;
  let view: SceneView | null = null;
  let scene: Scene | null = null;
  let orbit: Orbit | null = null;
  let moved = false; // the viewer moved the camera: a live refetch keeps it
  let render: Promise<typeof import("./scene-render.ts")> | null = null;
  let posterTimer: ReturnType<typeof setTimeout> | undefined;

  const showMsg = (text: string, poster?: { src?: string; sky?: Scene["sky"]; name?: string }) => {
    const p = el("p", "sc-msg-t", text);
    msg.replaceChildren(p);
    if (poster) {
      const frame = el("div", "sc-poster");
      if (poster.src) {
        const img = el("img");
        img.alt = poster.name ? `Still of ${poster.name}` : "Still of the scene";
        img.src = poster.src;
        frame.append(img);
      } else if (poster.sky) {
        frame.style.background = `linear-gradient(${poster.sky.top}, ${poster.sky.bottom})`;
        frame.append(el("span", "sc-poster-n", poster.name ?? ""));
      }
      msg.append(frame);
    }
    msg.hidden = false;
    hint.hidden = true;
  };

  const dropView = () => {
    clearTimeout(posterTimer);
    view?.dispose();
    view = null;
  };

  const apply = () => {
    if (view && orbit) view.setCamera({ pos: fromOrbit(orbit), look: orbit.target });
  };

  /** Saves a small still of the scene in local storage, for the no-WebGL fallback and later thumbnails. */
  const savePoster = (v: SceneView, p: string, s: string) => {
    try {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = POSTER_WIDTH;
        c.height = Math.max(1, Math.round((POSTER_WIDTH * img.height) / Math.max(1, img.width)));
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        try {
          localStorage.setItem(POSTER_KEY(p, s), c.toDataURL("image/jpeg", 0.8));
        } catch {
          /* storage full or blocked: no cached poster */
        }
      };
      img.src = v.poster();
    } catch {
      /* a lost context: no poster */
    }
  };

  const cachedPoster = (p: string, s: string): string | undefined => {
    try {
      return localStorage.getItem(POSTER_KEY(p, s)) ?? undefined;
    } catch {
      return undefined;
    }
  };

  async function mount(data: Scene, my: number) {
    if (!hasWebGL2()) {
      dropView();
      const src = cachedPoster(pid, sid);
      showMsg("This browser cannot draw 3D: WebGL 2 is turned off or missing. " + (src ? "Here is a still of the scene." : "Here are its sky colours."), { src, sky: data.sky, name: data.name });
      return;
    }
    try {
      const m = await (render ??= import("./scene-render.ts"));
      if (my !== seq || !open) return;
      const keep = moved && orbit ? orbit : null;
      dropView();
      view = m.createSceneView(stage, data);
      orbit = keep ?? toOrbit(data.camera.pos, view.lookPoint(data.camera.look));
      if (keep) apply();
      msg.hidden = true;
      hint.hidden = false;
      const v = view, p = pid, s = sid;
      posterTimer = setTimeout(() => {
        if (view === v && !document.hidden) savePoster(v, p, s);
      }, 1500);
    } catch (e) {
      if (my !== seq) return;
      dropView();
      render = null; // a failed chunk load may succeed next time
      showMsg(`The 3D view could not start: ${e instanceof Error ? e.message : String(e)}`, { src: cachedPoster(pid, sid), sky: data.sky, name: data.name });
    }
  }

  async function load(resetCamera: boolean) {
    const my = ++seq;
    if (resetCamera) {
      moved = false;
      orbit = null;
    }
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(pid)}/scenes/${encodeURIComponent(sid)}`, { headers: deps.headers() });
      if (my !== seq || !open) return;
      if (res.status === 401) return deps.locked();
      if (res.status === 404) {
        dropView();
        chipName.textContent = sid;
        return showMsg(`No scene "${sid}" in this project.`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { scene?: unknown };
      if (my !== seq || !open) return;
      scene = checkScene(body.scene);
      chipName.textContent = scene.name;
      await mount(scene, my);
    } catch (e) {
      if (my !== seq || !open) return;
      if (!view) showMsg(`Could not load the scene: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // --- orbit input -------------------------------------------------------------------
  let drag: { id: number; mode: "rotate" | "pan"; x: number; y: number } | null = null;
  stage.addEventListener("contextmenu", (e) => e.preventDefault());
  stage.addEventListener("pointerdown", (e) => {
    if (!view || !orbit || drag) return;
    const mode = e.button === 2 || (e.button === 0 && e.shiftKey) ? "pan" : e.button === 0 ? "rotate" : null;
    if (!mode) return;
    drag = { id: e.pointerId, mode, x: e.clientX, y: e.clientY };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add("grabbing");
    e.preventDefault();
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id || !orbit || !view) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    orbit = drag.mode === "rotate" ? orbitRotate(orbit, dx, dy) : orbitPan(orbit, dx, dy, view.camera().fov, stage.clientHeight);
    moved = true;
    apply();
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    stage.classList.remove("grabbing");
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener(
    "wheel",
    (e) => {
      if (!orbit || !view) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      orbit = orbitZoom(orbit, dy);
      moved = true;
      apply();
    },
    { passive: false },
  );

  const onKey = (e: KeyboardEvent) => {
    if (!open || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      deps.exit();
    } else if ((e.key === "r" || e.key === "R") && view && scene) {
      orbit = toOrbit(scene.camera.pos, view.lookPoint(scene.camera.look));
      moved = false;
      apply();
    }
  };

  return {
    open(p, s) {
      if (open && p === pid && s === sid) return;
      if (!open) document.addEventListener("keydown", onKey);
      open = true;
      pid = p;
      sid = s;
      scene = null;
      dropView();
      chipName.textContent = s;
      const seg = modeSegments(p, s, "orbit");
      chipMode.replaceWith(seg);
      chipMode = seg;
      showMsg("Loading the scene…");
      void load(true);
    },
    refetch() {
      if (open) void load(false);
    },
    close() {
      if (!open) return;
      open = false;
      seq++;
      drag = null;
      document.removeEventListener("keydown", onKey);
      dropView();
      msg.hidden = true;
    },
  };
}
