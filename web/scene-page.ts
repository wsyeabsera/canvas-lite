// Pure layout logic of Page mode (`#/project/<id>/scene/<sid>/page`, docs/ui.md "Page mode"): no DOM. web/scene-page-view.ts draws
// what these return; the scroll-to-camera mapping itself is web/page-scroll.ts (cameraAt).
import type { Section } from "../src/page-model.ts";
import type { Vec3, View } from "../src/scene.ts";
import type { Film } from "../src/shots.ts";
import { sectionRanges } from "./page-scroll.ts";

/** Card height of an overlay frame: min(70vh, 520px), never taller than 90% of its section's scroll length. The frame is sandboxed
 *  without same-origin, so the page cannot measure its content: the height is fixed and the frame does not scroll inside. */
export function cardHeight(section: Pick<Section, "height_vh">, viewportHeight: number): number {
  const sectionPx = ((section.height_vh ?? 100) / 100) * viewportHeight;
  return Math.max(120, Math.round(Math.min(0.7 * viewportHeight, 520, 0.9 * sectionPx)));
}

export type PageLayout = {
  /** Total scroll track height in px: the last section's end plus one viewport, so the last section can be scrolled through to its end. */
  track: number;
  sections: { id: string; title: string; align: "left" | "right" | "center"; start: number; end: number; card: number }[];
};

export function pageLayout(sections: Section[], viewportHeight: number): PageLayout {
  const ranges = sectionRanges(sections, viewportHeight);
  const last = ranges.length ? ranges[ranges.length - 1].end : 0;
  return {
    track: Math.round(last + viewportHeight),
    sections: sections.map((s, i) => ({
      id: s.id,
      title: s.title?.trim() || `Section ${i + 1}`,
      align: s.align ?? "left",
      start: ranges[i].start,
      end: ranges[i].end,
      card: cardHeight(s, viewportHeight),
    })),
  };
}

/** The section the scroll offset is in (start inclusive, end exclusive); past the last end the last section, before the first none (-1). In a gap: the one before it. */
export function activeSection(ranges: readonly { start: number; end: number }[], scrollY: number): number {
  let a = -1;
  for (let i = 0; i < ranges.length; i++) if (scrollY >= ranges[i].start) a = i;
  return a;
}

/** Where each rail dot sits, 0..1 from the top: a section's start over the last section's end (all 0 for an empty or zero-length page). */
export function railDots(ranges: readonly { start: number; end: number }[]): number[] {
  const total = ranges.length ? ranges[ranges.length - 1].end : 0;
  return ranges.map((r) => (total > 0 ? r.start / total : 0));
}

/** Scroll progress 0..1 through the whole page (the rail fill). */
export function pageProgress(ranges: readonly { start: number; end: number }[], scrollY: number): number {
  const total = ranges.length ? ranges[ranges.length - 1].end : 0;
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, scrollY / total));
}

/** Films with every string look-at replaced by its point (the renderer's `lookPoint`), so cameraAt blends looks smoothly instead of switching at half-way. */
export function resolveFilmLooks(films: Film[], lookPoint: (id: string) => Vec3): Film[] {
  const fix = (v: View): View => (typeof v.look === "string" ? { ...v, look: lookPoint(v.look) } : v);
  return films.map((f) => ({ ...f, shots: f.shots.map((s) => ({ ...s, from: fix(s.from), to: fix(s.to) })) }));
}

/** The srcdoc of an overlay frame: Claude's html (already checked by `unsafeHtml` on write) in a fixed, transparent, non-scrolling document.
 *  The frame is `sandbox=""` (no scripts, no same-origin), so this only styles; it never runs anything. */
export function overlaySrcdoc(html: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer">' +
    "<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent;color-scheme:dark}" +
    "body{box-sizing:border-box;padding:28px 32px;color:#f3f5fa;font:15px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}" +
    "h1,h2,h3{line-height:1.15;margin:0 0 .5em}h1{font-size:34px}h2{font-size:26px}p{margin:0 0 .8em}a{color:#9db6ff}</style></head><body>" +
    html +
    "</body></html>"
  );
}

/** The sandbox of an overlay frame: empty, so no scripts and no same-origin. Never add allow-scripts. */
export const OVERLAY_SANDBOX = "";
