// What a blind user sees of a screen, and how a walk is scored (docs/variants.md). Pure: no Sql, no DOM, no clock.
// A user sees only visible text and the labels of its links, never a screen id, and the score is plain graph arithmetic.

export type Choice = { label: string; to: string | null }; // to null: a back control
export type Seen = { text: string; choices: Choice[] };

export const TEXT_MAX = 2000;
export const LABEL_MAX = 80;
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"]);
const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]);
const squash = (s: string) => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(1).find((v) => v !== undefined);

function body(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|head|svg|template)\b[\s\S]*?<\/\1>/gi, " ");
}

/** The inner html of the element whose open tag ends at `from`, found by counting same-name tags. */
function inner(html: string, name: string, from: number): string {
  const re = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, "gi");
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[2] === "/" && m[1] === "") continue;
    depth += m[1] === "/" ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
}

/** The visible text (capped) and the links of a screen, in document order. Elements marked `data-inert` are not choices. */
export function seen(html: string): Seen {
  const b = body(html);
  const choices: Choice[] = [];
  const keys = new Set<string>();
  const open = /<([a-z][a-z0-9]*)\b([^>]*\bdata-(?:to|back)\b[^>]*)>/gi;
  for (let m = open.exec(b); m; m = open.exec(b)) {
    const [tag, name, attrs] = [m[0], m[1].toLowerCase(), m[2]];
    if (/\sdata-inert\b/i.test(tag) || VOID.has(name)) continue;
    const to = attr(tag, "data-to") ?? null;
    const isBack = /\sdata-back\b/i.test(attrs) && to === null;
    if (to === null && !isBack) continue;
    let label = squash(inner(b, name, m.index + tag.length));
    if (!label) label = decode(attr(tag, "aria-label") ?? attr(tag, "title") ?? "").trim() || (isBack ? "Back" : "(unlabelled)");
    label = label.slice(0, LABEL_MAX);
    const key = `${label}\u0000${to}`;
    if (keys.has(key)) continue;
    keys.add(key);
    choices.push({ label, to });
  }
  return { text: squash(b).slice(0, TEXT_MAX), choices };
}

export type ScreenIn = { id: string; html: string };

/** Distance in moves from each screen to the nearest screen whose text contains `target` (case-insensitive); absent when unreachable. Back is not a move. */
export function distances(screens: readonly ScreenIn[], target: string): Map<string, number> {
  const t = target.trim().toLowerCase();
  const info = new Map(screens.map((s) => [s.id, seen(s.html)]));
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, s] of info) if (t && s.text.toLowerCase().includes(t)) { dist.set(id, 0); queue.push(id); }
  const rev = new Map<string, string[]>();
  for (const [id, s] of info) for (const c of s.choices) if (c.to !== null && info.has(c.to)) rev.set(c.to, [...(rev.get(c.to) ?? []), id]);
  for (let i = 0; i < queue.length; i++)
    for (const from of rev.get(queue[i]) ?? []) if (!dist.has(from)) { dist.set(from, dist.get(queue[i])! + 1); queue.push(from); }
  return dist;
}

export const reachedGoal = (html: string, target: string): boolean => !!target.trim() && seen(html).text.toLowerCase().includes(target.trim().toLowerCase());

/** Ids of screens with no choices at all (computed once, when a walk starts). */
export const deadScreens = (screens: readonly ScreenIn[]): string[] => screens.filter((s) => seen(s.html).choices.length === 0).map((s) => s.id);

export type Score = { steps: number; shortest: number | null; wrong_turns: number; dead_ends: number; reached: boolean };

/** `path` is every screen visited, start first. A wrong turn is a move that ends farther from the goal than it began (or with no way to it). A dead end is a visited screen, not the goal, with no choices at all. */
export function scoreWalk(path: readonly string[], dist: ReadonlyMap<string, number>, dead: ReadonlySet<string>, reached: boolean): Score {
  let wrong = 0;
  for (let i = 1; i < path.length; i++) {
    const a = dist.get(path[i - 1]);
    const b = dist.get(path[i]);
    if (a !== undefined && (b === undefined || b > a)) wrong++;
  }
  const deadEnds = new Set(path.filter((id) => dist.get(id) !== 0 && dead.has(id))).size;
  return { steps: Math.max(0, path.length - 1), shortest: dist.get(path[0]) ?? null, wrong_turns: wrong, dead_ends: deadEnds, reached };
}
