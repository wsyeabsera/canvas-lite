// The WebGPU backdrop's DOM and shader wiring (task #1962). page.ts loads this chunk with import() only after hasWebGPU()
// says yes and only off the canvas routes. Any failure removes the canvas and leaves today's CSS gradient as it was.
import { createShader, type ShaderInstance } from "shaders/js";
// Type-only: page.ts hands the helpers in, so backdrop.ts stays inside page.js instead of becoming a shared chunk
// that every page load would have to fetch.
import type * as Helpers from "./backdrop.ts";

const MESH = "bd-mesh";
const NOISE = "bd-noise";

function preset(c: Helpers.BackdropColors, still: boolean) {
  return {
    components: [
      // a slow, soft mesh of the theme's blobs; speed 0 under reduced motion draws one still frame
      { type: "MeshGradient", id: MESH, props: { stops: c.stops, colorA: c.base, colorB: c.base, colorSpace: "oklab", count: 5, smoothness: 2.6, variation: 0.3, swirl: 0.12, drift: 0.45, speed: still ? 0 : 0.12, seed: 7 } },
      // faint drifting noise so the large flat areas do not band
      { type: "SimplexNoise", id: NOISE, props: { colorA: "#000000", colorB: "#ffffff", scale: 2.2, speed: still ? 0 : 0.08, opacity: 0.05, blendMode: "softLight" } },
    ],
  };
}

/** Mounts the shader into #backdrop. Never throws: on any error the canvas is removed and the page keeps its CSS gradient. */
export async function startBackdrop(host: HTMLElement, app: HTMLElement, h: Pick<typeof Helpers, "parseTheme" | "shouldRun" | "shouldShow" | "themeColors">): Promise<void> {
  const { parseTheme, shouldRun, shouldShow, themeColors } = h;
  const root = document.documentElement;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = document.createElement("canvas");
  let shader: ShaderInstance | null = null;
  let dead = false;
  let ready = false; // the class "on" (fade in) waits for the first frame
  const observers: MutationObserver[] = [];

  const teardown = () => {
    // idempotent: it can run from onError while createShader is pending and again once it resolves
    dead = true;
    for (const o of observers) o.disconnect();
    document.removeEventListener("visibilitychange", sync);
    motion.removeEventListener("change", onMotion);
    try {
      shader?.destroy();
    } catch {
      /* already gone */
    }
    shader = null;
    host.classList.remove("on");
    canvas.remove();
  };

  const input = () => ({ hidden: document.hidden, canvasMode: app.classList.contains("canvas-mode"), reducedMotion: motion.matches });
  let running = true; // createShader auto-starts its loop
  function sync() {
    if (dead || !shader) return;
    const s = input();
    host.classList.toggle("on", ready && shouldShow(s));
    const run = shouldRun(s) || !ready; // keep going until the first frame is on the canvas, even under reduced motion
    if (run === running) return;
    running = run;
    run ? shader.resume() : shader.pause();
  }
  /** Redraws one frame while paused (theme or motion change under reduced motion), then pauses again. */
  const redraw = () => {
    if (!shader || running) return;
    shader.resume();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (shader && !running) shader.pause();
    }));
  };
  const applyTheme = () => {
    if (dead || !shader) return;
    const c = themeColors(parseTheme(root.dataset.theme));
    shader.update(MESH, { stops: c.stops, colorA: c.base, colorB: c.base });
    redraw();
  };
  function onMotion() {
    if (dead || !shader) return;
    const still = motion.matches;
    shader.update(MESH, { speed: still ? 0 : 0.12 });
    shader.update(NOISE, { speed: still ? 0 : 0.08 });
    sync();
    redraw();
  }

  try {
    canvas.setAttribute("aria-hidden", "true");
    host.append(canvas);
    const theme = parseTheme(root.dataset.theme);
    shader = await createShader(canvas, preset(themeColors(theme), motion.matches), {
      disableTelemetry: true, // never phone home (and connect-src 'self' would block it anyway)
      onReady: () => {
        ready = true;
        sync();
      },
      onError: () => {
        // recoverable device losses rebuild on their own; only terminal reasons end here with getFailureReason() set
        if (!shader || shader.getFailureReason()) teardown();
      },
    });
    if (dead || shader.getFailureReason()) return teardown(); // also destroys an instance that failed while createShader was pending
    const themeObs = new MutationObserver(applyTheme);
    themeObs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    const appObs = new MutationObserver(sync);
    appObs.observe(app, { attributes: true, attributeFilter: ["class"] });
    observers.push(themeObs, appObs);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", onMotion);
    if (parseTheme(root.dataset.theme) !== theme) applyTheme(); // changed while createShader was pending
    sync();
  } catch {
    teardown();
  }
}
