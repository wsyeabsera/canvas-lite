// The WebGPU backdrop behind the glass (task #1962): pure helpers, unit-tested. The DOM and shader wiring live in
// backdrop-view.ts, which page.ts imports lazily only after hasWebGPU() says yes, so other browsers never download it.
import type { Theme } from "./theme.ts";

/** Just the part of `navigator` the check reads, so tests can pass a plain object. */
export interface NavigatorLike {
  gpu?: unknown;
}

/** True when the browser exposes WebGPU (navigator.gpu with requestAdapter). An adapter can still be refused later. */
export function hasWebGPU(nav: NavigatorLike | undefined | null): boolean {
  try {
    const gpu = nav?.gpu as { requestAdapter?: unknown } | null | undefined;
    return typeof gpu === "object" && gpu !== null && typeof gpu.requestAdapter === "function";
  } catch {
    return false; // a throwing getter counts as no WebGPU
  }
}

export interface RunInput {
  hidden: boolean; // document.hidden
  canvasMode: boolean; // #app.canvas-mode: the canvas keeps its plain dotted surface
  reducedMotion: boolean; // prefers-reduced-motion: reduce
}

/** Whether the shader should be visible at all. */
export function shouldShow(s: Pick<RunInput, "canvasMode">): boolean {
  return !s.canvasMode;
}

/** Whether the animation loop should run. Reduced motion keeps one static frame instead. */
export function shouldRun(s: RunInput): boolean {
  return !s.hidden && !s.canvasMode && !s.reducedMotion;
}

/** The colours today's CSS gradient uses (public/index.html --bgimg): a base and three tinted blobs with their alpha. */
const TOKENS: Record<Theme, { base: string; blobs: [string, number][] }> = {
  dark: { base: "#0a0c13", blobs: [["#6366f1", 0.42], ["#ec4899", 0.22], ["#14b8a6", 0.28]] },
  light: { base: "#eef1f9", blobs: [["#6366f1", 0.3], ["#f472b6", 0.28], ["#2dd4bf", 0.32]] },
};

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

/** Mixes `top` over `base` at alpha `t` (0..1), both #rrggbb; returns #rrggbb. */
export function mixHex(base: string, top: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  let out = "#";
  for (let i = 0; i < 3; i++) out += hex2(ch(base, i) + (ch(top, i) - ch(base, i)) * t);
  return out;
}

export interface ColorStop {
  color: string;
  position: number;
}
export interface BackdropColors {
  base: string;
  stops: ColorStop[]; // MeshGradient palette, at most 8
}

/** The mesh palette for a theme: the base colour alternating with each blob pre-mixed at its CSS alpha, so it stays as calm as today. */
export function themeColors(theme: Theme): BackdropColors {
  const t = TOKENS[theme] ?? TOKENS.dark;
  const [a, b, c] = t.blobs.map(([hex, alpha]) => mixHex(t.base, hex, alpha)) as [string, string, string];
  return {
    base: t.base,
    stops: [
      { color: t.base, position: 0 },
      { color: a, position: 0.25 },
      { color: t.base, position: 0.5 },
      { color: b, position: 0.75 },
      { color: c, position: 1 },
    ],
  };
}

/** Anything but "light" is the dark palette, like the CSS default. */
export function parseTheme(raw: string | undefined | null): Theme {
  return raw === "light" ? "light" : "dark";
}
