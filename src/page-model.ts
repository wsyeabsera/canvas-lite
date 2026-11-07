// The page model (docs/scenes.md "Page"): a page is an ordered list of sections; each section is an overlay (safe html) bound to
// one shot of a film, or to a pair of shots. Pure: validation and coverage. The scroll mapping lives in web/page-scroll.ts.
import type { Scene } from "./scene.ts";
import type { Film } from "./shots.ts";

export type SectionShot = string | [string, string];
export type Section = { id: string; title?: string; html: string; shot: SectionShot; align?: "left" | "right" | "center"; height_vh?: number; gap_vh?: number };
export type Page = { sections: Section[] };

export const SECTIONS_MAX = 12;
export const SECTION_HTML_MAX = 20_000;
export const PAGE_HTML_MAX = 100_000;
export const SECTION_TITLE_MAX = 80;
export const HEIGHT_VH_MIN = 50;
export const HEIGHT_VH_MAX = 300;
export const HEIGHT_VH_DEFAULT = 100;
export const GAP_VH_MAX = 100;
export const ALIGNS = ["left", "right", "center"] as const;

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const bytes = (s: string) => new TextEncoder().encode(s).length;

/** The first banned construct in overlay html, or null. Attribute checks look inside each `<...>` tag, so prose may mention "onclick=" safely. */
export function unsafeHtml(html: string): string | null {
  const tag = /<(script|iframe|object|embed|form)\b/i.exec(html);
  if (tag) return `<${tag[1].toLowerCase()}>`;
  for (const t of html.matchAll(/<[a-z][^>]*>/gi)) {
    const on = /[\s/"'`]on[a-z]+\s*=/i.exec(t[0]);
    if (on) return `${on[0].slice(1).trim().replace(/\s*=$/, "")} attribute`;
    // Strip whitespace, control characters and encoded colons/tabs before looking for a script url.
    const flat = t[0]
      .replace(/&colon;?|&#0*58;?|&#x0*3a;?/gi, ":")
      .replace(/&tab;?|&newline;?|&#0*(9|10|13);?|&#x0*(9|a|d);?/gi, "")
      .replace(/[\u0000- \u007f-\u009f]+/g, "");
    if (/javascript:/i.test(flat) || /vbscript:/i.test(flat)) return "javascript: url";
  }
  return null;
}

/** Pure: input -> normalised page. Errors name `section "<id>"` and the offending construct or shot id. Shots are looked up in every film of the scene. */
export function checkPage(input: unknown, _scene: Scene, films: Film[]): Page {
  if (!isObj(input) || !Array.isArray(input.sections)) throw new Error("invalid page: must be {sections: [...]}");
  const list = input.sections;
  if (list.length < 1 || list.length > SECTIONS_MAX) throw new Error(`invalid page: use 1 to ${SECTIONS_MAX} sections`);
  const known = new Set(films.flatMap((f) => f.shots.map((s) => s.id)));
  const seen = new Set<string>();
  let total = 0;
  const sections = list.map((raw: unknown, i): Section => {
    if (!isObj(raw)) throw new Error(`invalid section ${i}: must be an object {id, html, shot}`);
    const id = raw.id;
    if (typeof id !== "string" || id.length > 40 || !ID_RE.test(id)) throw new Error(`invalid section ${i}: id ${JSON.stringify(id)} must be lowercase letters, digits and -, at most 40`);
    if (seen.has(id)) throw new Error(`invalid section ${i}: duplicate id "${id}"`);
    seen.add(id);
    const at = `invalid section "${id}"`;
    if (typeof raw.html !== "string") throw new Error(`${at}: html must be text`);
    const size = bytes(raw.html);
    if (size > SECTION_HTML_MAX) throw new Error(`${at}: html is ${size} bytes, limit ${SECTION_HTML_MAX}`);
    total += size;
    const bad = unsafeHtml(raw.html);
    if (bad) throw new Error(`${at}: html contains ${bad}: overlays are text and markup only, no scripts, event attributes, javascript: urls, iframes, objects, embeds or forms`);
    const out: Section = { id, html: raw.html, shot: "" };
    if (raw.title !== undefined && raw.title !== "") {
      if (typeof raw.title !== "string" || raw.title.length > SECTION_TITLE_MAX) throw new Error(`${at}: title must be text of at most ${SECTION_TITLE_MAX} characters`);
      out.title = raw.title;
    }
    const s = raw.shot;
    const ids = typeof s === "string" ? [s] : Array.isArray(s) && s.length === 2 && s.every((x) => typeof x === "string") ? (s as string[]) : null;
    if (!ids) throw new Error(`${at}: shot must be a shot id or a pair [first shot id, second shot id]`);
    for (const sid of ids) if (!known.has(sid)) throw new Error(`${at}: unknown shot "${sid}": use a shot id from read_scene films`);
    out.shot = typeof s === "string" ? s : [ids[0], ids[1]];
    if (raw.align !== undefined) {
      if (typeof raw.align !== "string" || !(ALIGNS as readonly string[]).includes(raw.align)) throw new Error(`${at}: align must be one of ${ALIGNS.join(", ")}`);
      out.align = raw.align as Section["align"];
    }
    if (raw.height_vh !== undefined) {
      if (typeof raw.height_vh !== "number" || !Number.isFinite(raw.height_vh) || raw.height_vh < HEIGHT_VH_MIN || raw.height_vh > HEIGHT_VH_MAX)
        throw new Error(`${at}: height_vh must be a number from ${HEIGHT_VH_MIN} to ${HEIGHT_VH_MAX}`);
      out.height_vh = raw.height_vh;
    }
    if (raw.gap_vh !== undefined) {
      if (typeof raw.gap_vh !== "number" || !Number.isFinite(raw.gap_vh) || raw.gap_vh < 0 || raw.gap_vh > GAP_VH_MAX)
        throw new Error(`${at}: gap_vh must be a number from 0 to ${GAP_VH_MAX}`);
      out.gap_vh = raw.gap_vh;
    }
    return out;
  });
  if (total > PAGE_HTML_MAX) throw new Error(`invalid page: html is ${total} bytes in all, limit ${PAGE_HTML_MAX}`);
  return { sections };
}

/** Shots no section uses (a pair covers its two shots), in film order. Info only: the review reports them, nothing is rejected. */
export function pageCoverage(page: Page, films: Film[]): { film: string; shot: string }[] {
  const used = new Set(page.sections.flatMap((s) => (typeof s.shot === "string" ? [s.shot] : s.shot)));
  return films.flatMap((f) => f.shots.filter((s) => !used.has(s.id)).map((s) => ({ film: f.id, shot: s.id })));
}
