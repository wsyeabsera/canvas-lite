// Link coverage (docs/prototype-tools.md): which interactive-looking controls in a screen go nowhere.
// Pure, no DOM: a tag scan with a simple open-element stack, in the style of `extractLinks`. The page uses the same
// predicate (`isControlLike`) on live elements, so the write-time warning and the Shift overlay agree.

export const UNLINKED_CAP = 20;
export const SAMPLE_TEXT = 40;

const CONTROL_TAGS = new Set(["button", "a", "input", "select", "summary"]);
const CONTROL_ROLES = new Set(["button", "link", "tab", "menuitem"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

type Get = (name: string) => string | null;

/** The one definition of "looks interactive": tag, role, tabindex (not -1), inline cursor:pointer. `get` reads an attribute (null = absent). */
export function isControlLike(tag: string, get: Get): boolean {
  const t = tag.toLowerCase();
  if (t === "input" && (get("type") ?? "").trim().toLowerCase() === "hidden") return false;
  if (CONTROL_TAGS.has(t)) return true;
  if (CONTROL_ROLES.has((get("role") ?? "").trim().toLowerCase())) return true;
  const ti = get("tabindex");
  if (ti !== null && ti.trim() !== "-1") return true;
  return /cursor\s*:\s*pointer/i.test(get("style") ?? "");
}

/** The element links or goes back by itself. */
export const hasLinkAttr = (get: Get): boolean => get("data-to") !== null || get("data-back") !== null;
/** `data-inert` (any value but "false"): the designer says this control intentionally goes nowhere. */
export const isInert = (get: Get): boolean => {
  const v = get("data-inert");
  return v !== null && v.trim().toLowerCase() !== "false";
};

export type UnlinkedControl = { tag: string; text: string; index: number };
export type ControlScan = { controls: number; linked: number; unlinked: number; items: UnlinkedControl[] };

const TOKEN_RE = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][^\s>\/]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+|<)/g;
const ATTR_RE = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const attrsOf = (src: string): Map<string, string> => {
  const m = new Map<string, string>();
  for (const a of src.matchAll(ATTR_RE)) {
    const k = a[1]!.toLowerCase();
    if (!m.has(k)) m.set(k, a[2] ?? a[3] ?? a[4] ?? "");
  }
  return m;
};
const clip = (s: string): string => s.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, SAMPLE_TEXT);

type Open = { tag: string; handled: boolean; inert: boolean; reported: boolean; index: number; text: string; fallback: string };

/** Scans html: every control-like element, counted as linked (own or ancestor data-to/data-back) or unlinked.
 *  `data-inert` on the element or an ancestor skips it entirely (not counted). Descendants of an unlinked control are not reported
 *  again (fix the outer one). Limits: no DOM, so html a browser would repair (unclosed tags, bad nesting) is read leniently by a
 *  stack that closes to the nearest matching open tag; `<script>`/`<style>` bodies are skipped; controls made only by CSS
 *  (class-based cursor, `:hover`) are not seen; `index` is the element's order in the document, not a character offset.
 *  `items` is every unlinked control, uncapped. */
export function scanControls(html: string): ControlScan {
  const stack: Open[] = [];
  const items: UnlinkedControl[] = [];
  let controls = 0, linked = 0, idx = 0;
  let raw: string | null = null;
  const done = (o: Open) => {
    if (o.reported) items.push({ tag: o.tag, text: clip(o.text) || clip(o.fallback), index: o.index });
  };
  for (const m of html.matchAll(TOKEN_RE)) {
    if (m[4] !== undefined) {
      if (raw === null) for (const o of stack) if (o.reported && o.text.length < 200) o.text += m[4];
      continue;
    }
    if (m[2] === undefined) continue; // comment
    const tag = m[2].toLowerCase();
    if (raw !== null) {
      if (m[1] === "/" && tag === raw) raw = null;
      continue;
    }
    if (m[1] === "/") {
      const at = stack.map((o) => o.tag).lastIndexOf(tag);
      if (at >= 0) while (stack.length > at) done(stack.pop()!);
      continue;
    }
    const attrs = attrsOf(m[3] ?? "");
    const get: Get = (n) => attrs.get(n) ?? null;
    const index = idx++;
    const inert = isInert(get);
    const own = hasLinkAttr(get);
    const skip = inert || stack.some((o) => o.inert);
    let reported = false;
    if (!skip && isControlLike(tag, get)) {
      controls++;
      if (own || stack.some((o) => o.handled)) linked++;
      else if (!stack.some((o) => o.reported)) reported = true;
    }
    const o: Open = { tag, handled: own, inert, reported, index, text: "", fallback: get("aria-label") || get("value") || get("placeholder") || get("title") || get("alt") || "" };
    if (VOID.has(tag) || /\/\s*$/.test(m[3] ?? "")) {
      done(o);
      continue;
    }
    if (tag === "script" || tag === "style") {
      raw = tag;
      continue;
    }
    stack.push(o);
  }
  while (stack.length) done(stack.pop()!);
  items.sort((a, b) => a.index - b.index);
  return { controls, linked, unlinked: items.length, items };
}

/** Interactive-looking controls with no data-to/data-back (own or ancestor) and no data-inert. At most `cap` (default 20), in document order. */
export function unlinkedControls(html: string, cap = UNLINKED_CAP): UnlinkedControl[] {
  return scanControls(html).items.slice(0, cap);
}

/** `3 unlinked controls: "Pay", "Back", "x", +1 more` (max `samples` quoted). */
export function unlinkedSummary(n: number, items: UnlinkedControl[], samples = 5): string {
  const quoted = items.slice(0, samples).map((c) => `"${c.text || `<${c.tag}>`}"`).join(", ");
  return `${n} unlinked control${n === 1 ? "" : "s"}: ${quoted}${n > samples ? `, +${n - samples} more` : ""}`;
}

/** The write-time warning for one screen's html, or [] when every control is wired or inert. */
export function unlinkedWarnings(html: string): string[] {
  const s = scanControls(html);
  return s.unlinked > 0 ? [unlinkedSummary(s.unlinked, s.items)] : [];
}

export type Coverage = { screens: number; controls: number; linked: number; unlinked: number; ratio: number };
/** Canvas-wide totals; ratio = linked / controls rounded to 2 decimals (1 when there are no controls). */
export function coverageOf(scans: ControlScan[]): Coverage {
  const controls = scans.reduce((n, s) => n + s.controls, 0);
  const linked = scans.reduce((n, s) => n + s.linked, 0);
  return { screens: scans.length, controls, linked, unlinked: scans.reduce((n, s) => n + s.unlinked, 0), ratio: controls === 0 ? 1 : Math.round((linked / controls) * 100) / 100 };
}
