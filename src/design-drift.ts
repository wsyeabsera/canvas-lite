// Drift checks (docs/design-system.md): does a screen use colors, fonts and font sizes outside the project's design system?
// Pure. Only the screen's own CSS is read (style blocks and style attributes), never its text, and a group with no tokens is not checked.
import { normalizeHex, type DesignSystem } from "./design-system.ts";
import type { ReviewIssue } from "./review.ts";

const SHOWN = 5;
const COLOR_PROPS = /^(?:[a-z-]*color|background(?:-image)?|border(?:-[a-z]+)?|outline|box-shadow|text-shadow|fill|stroke)$/;

function cssText(html: string): string {
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const attrs = [...html.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => m[1] ?? m[2]);
  // Joined with `;`: the last declaration of an inline style has none, and without it the scan below would read the next attribute as part of its value.
  return [...blocks, ...attrs].join(";\n");
}

const hex2 = (n: string) => Math.min(255, Number(n)).toString(16).padStart(2, "0");

/** Every color literal in the color-bearing declarations, as lowercase #rrggbb (alpha dropped). */
function colorsIn(css: string): string[] {
  const out: string[] = [];
  for (const [, prop, value] of css.matchAll(/([a-z-]+)\s*:\s*([^;{}]*)/gi)) {
    if (!COLOR_PROPS.test(prop.toLowerCase())) continue;
    for (const m of value.matchAll(/#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi)) {
      if (m[1] !== undefined) out.push(`#${hex2(m[1])}${hex2(m[2])}${hex2(m[3])}`);
      else out.push(normalizeHex(m[0].length === 9 ? m[0].slice(0, 7) : m[0]) ?? m[0]);
    }
  }
  return out;
}

const firstFamily = (stack: string) => stack.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();

const uniq = (xs: string[]) => [...new Set(xs)];
const listed = (xs: string[]) => xs.slice(0, SHOWN).join(", ") + (xs.length > SHOWN ? `, and ${xs.length - SHOWN} more` : "");

/** One warning per screen and kind, up to five offending values each. Empty when the screens follow the tokens. */
export function driftIssues(screens: readonly { id: string; html: string }[], ds: DesignSystem): ReviewIssue[] {
  const colors = new Set(Object.values(ds.colors));
  const fonts = new Set(Object.values(ds.fonts).map(firstFamily));
  const sizes = new Set(Object.values(ds.sizes));
  const issues: ReviewIssue[] = [];
  for (const s of screens) {
    const css = cssText(s.html);
    if (colors.size) {
      const off = uniq(colorsIn(css).filter((c) => !colors.has(c)));
      if (off.length)
        issues.push({ severity: "warning", kind: "off_token_color", screen: s.id, message: `"${s.id}" uses colors that are not in the design system: ${listed(off)}`, fix: "use the nearest token color (get_design_system), or add the color with patch_design_system if it belongs in the system" });
    }
    if (fonts.size) {
      const off = uniq([...css.matchAll(/font-family\s*:\s*([^;{}"]*)/gi)].map((m) => firstFamily(m[1])).filter((f) => f && !fonts.has(f)));
      if (off.length)
        issues.push({ severity: "warning", kind: "off_token_font", screen: s.id, message: `"${s.id}" uses fonts that are not in the design system: ${listed(off)}`, fix: "use a token font (get_design_system), or add it with patch_design_system" });
    }
    if (sizes.size) {
      const off = uniq([...css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((m) => Number(m[1])).filter((n) => !sizes.has(n)).map((n) => `${n}px`));
      if (off.length)
        issues.push({ severity: "warning", kind: "off_token_size", screen: s.id, message: `"${s.id}" uses font sizes that are not in the design system: ${listed(off)}`, fix: "use a token size (get_design_system), or add it with patch_design_system" });
    }
  }
  return issues;
}
