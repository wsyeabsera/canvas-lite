// Screen links for the prototype flow: `data-to="<screen-id>"` with optional `data-transition` and `data-back` in the screen html.
// Pure, no DOM. Chosen approach (spike #1973): the page shows screens in `sandbox="allow-same-origin"` frames (still no scripts),
// reads the `[data-to]` elements from `frame.contentDocument` and calls `readLink` on each; `extractLinks` is the string-side twin
// (no DOM, no layout) used where only the targets matter, e.g. warning about dangling links.
export const TRANSITIONS = ["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down"] as const;
export type Transition = (typeof TRANSITIONS)[number];
export type Link = { to: string; transition: Transition; back: boolean };

const ID = /^[a-z0-9-]{1,40}$/;

/** A link from the three attribute values (null = attribute absent); null when `data-to` is missing or not a screen id. */
export function readLink(to: string | null, transition: string | null, back: string | null): Link | null {
  const id = to?.trim() ?? "";
  if (!ID.test(id)) return null;
  const t = transition?.trim().toLowerCase() ?? "";
  return { to: id, transition: (TRANSITIONS as readonly string[]).includes(t) ? (t as Transition) : "none", back: back !== null && back.trim().toLowerCase() !== "false" };
}

const TAG = /<[a-zA-Z][^<>]*\sdata-to\s*=[^<>]*>/gi;
const ATTR = /\s(data-[a-z-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gi;

/** Every link in a html string, in document order. A regex pass: good enough for the targets (a `data-to` inside a comment
 *  or script text is also found), never for positions. */
export function extractLinks(html: string): Link[] {
  const out: Link[] = [];
  for (const m of html.matchAll(TAG)) {
    const a: Record<string, string> = {};
    for (const x of m[0].matchAll(ATTR)) a[x[1]!.toLowerCase()] ??= x[2] ?? x[3] ?? x[4] ?? "";
    const l = readLink(a["data-to"] ?? null, a["data-transition"] ?? null, a["data-back"] ?? null);
    if (l) out.push(l);
  }
  return out;
}

/** Link targets that name no screen of the canvas, once each, in first-seen order. */
export function danglingTargets(links: readonly Link[], screenIds: Iterable<string>): string[] {
  const ids = new Set(screenIds);
  return [...new Set(links.map((l) => l.to))].filter((t) => !ids.has(t));
}
