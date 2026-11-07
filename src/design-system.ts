// The design system of a project (docs/design-system.md): tokens as data plus written rules. Pure: no Sql, no DOM.
// Everything is checked before it is stored; an error names the path of the bad value.

export const GROUPS = ["colors", "fonts", "sizes", "space", "radius"] as const;
export type Group = (typeof GROUPS)[number];
export type DesignSystem = {
  name: string;
  colors: Record<string, string>; // #rrggbb, lowercase
  fonts: Record<string, string>; // CSS font-family stacks
  sizes: Record<string, number>; // font sizes, px
  space: Record<string, number>; // px
  radius: Record<string, number>; // px
  rules: string; // Markdown
};
export type DesignEdit = { group: Group | "rules" | "name"; name?: string; value?: string | number; remove?: boolean };

export const TOKENS_MAX = 64;
export const NAME_MAX = 80;
export const RULES_MAX = 8000;
export const FONT_MAX = 200;
export const DESIGN_BYTES_MAX = 50_000;
export const EDITS_MAX = 50;
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const emptyDesignSystem = (): DesignSystem => ({ name: "", colors: {}, fonts: {}, sizes: {}, space: {}, radius: {}, rules: "" });

/** `#abc` and `#AABBCC` become `#aabbcc`; null when it is not a hex color. */
export function normalizeHex(v: string): string | null {
  if (!HEX_RE.test(v)) return null;
  const h = v.slice(1).toLowerCase();
  return "#" + (h.length === 3 ? [...h].map((c) => c + c).join("") : h);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function checkValue(group: Group, path: string, v: unknown): string | number {
  if (group === "colors") {
    const hex = typeof v === "string" ? normalizeHex(v) : null;
    if (!hex) throw new Error(`invalid ${path}: use a color like #aabbcc`);
    return hex;
  }
  if (group === "fonts") {
    if (typeof v !== "string" || v.trim() === "" || v.length > FONT_MAX || /[;{}\n]/.test(v)) throw new Error(`invalid ${path}: use a CSS font-family stack of 1 to ${FONT_MAX} characters without ; { } or a line break`);
    return v.trim();
  }
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 999) throw new Error(`invalid ${path}: use a whole number of pixels from 0 to 999`);
  return v;
}

const checkTokenName = (path: string, name: unknown): string => {
  if (typeof name !== "string" || name.length > 40 || !ID_RE.test(name)) throw new Error(`invalid ${path}: use lowercase letters, digits and -, at most 40`);
  return name;
};

/** Checks a whole design system and returns it normalized (all groups present). Unknown keys are errors. */
export function checkDesignSystem(input: unknown): DesignSystem {
  if (!isRecord(input)) throw new Error("invalid design system: expected an object");
  const out = emptyDesignSystem();
  for (const key of Object.keys(input)) {
    const v = input[key];
    if (key === "name" || key === "rules") {
      const max = key === "name" ? NAME_MAX : RULES_MAX;
      if (typeof v !== "string" || v.length > max) throw new Error(`invalid ${key}: use text of at most ${max} characters`);
      out[key] = v;
    } else if ((GROUPS as readonly string[]).includes(key)) {
      const group = key as Group;
      if (!isRecord(v)) throw new Error(`invalid ${key}: expected an object of tokens`);
      const names = Object.keys(v);
      if (names.length > TOKENS_MAX) throw new Error(`invalid ${key}: at most ${TOKENS_MAX} tokens`);
      for (const n of names) (out[group] as Record<string, string | number>)[checkTokenName(`${key}.${n} (token name)`, n)] = checkValue(group, `${key}.${n}`, v[n]);
    } else throw new Error(`invalid design system: unknown key "${key}"`);
  }
  if (new TextEncoder().encode(JSON.stringify(out)).length > DESIGN_BYTES_MAX) throw new Error(`design system too large: limit ${DESIGN_BYTES_MAX} bytes`);
  return out;
}

/** Applies token edits in order to a copy, then re-checks the whole result. */
export function applyDesignEdits(cur: DesignSystem, edits: unknown): DesignSystem {
  if (!Array.isArray(edits) || edits.length < 1 || edits.length > EDITS_MAX) throw new Error(`invalid edits: use 1 to ${EDITS_MAX} edits`);
  const next = structuredClone(cur) as DesignSystem;
  edits.forEach((e: DesignEdit, i) => {
    const bad = (why: string) => new Error(`invalid edit ${i}: ${why}`);
    if (!isRecord(e)) throw bad("must be {group, name?, value?, remove?}");
    if (e.group === "rules" || e.group === "name") {
      if (typeof e.value !== "string") throw bad(`${e.group} needs a text value`);
      next[e.group] = e.value;
      return;
    }
    if (!(GROUPS as readonly string[]).includes(e.group)) throw bad(`group must be one of ${[...GROUPS, "rules", "name"].join(", ")}`);
    const name = checkTokenName(`edit ${i} name`, e.name);
    const tokens = next[e.group] as Record<string, string | number>;
    if (e.remove === true) {
      if (!(name in tokens)) throw bad(`no token "${name}" in ${e.group}`);
      delete tokens[name];
    } else {
      if (e.value === undefined) throw bad("needs a value, or remove: true");
      tokens[name] = e.value;
    }
  });
  return checkDesignSystem(next);
}

const TITLE: Record<Group, string> = { colors: "Colors", fonts: "Fonts", sizes: "Sizes (px)", space: "Space (px)", radius: "Radius (px)" };
const cell = (v: string | number) => String(v).replace(/\|/g, "\\|");

/** The one DESIGN.md text: heading, rules, then a table per non-empty group. Built from the data, never stored. */
export function renderDesignMd(ds: DesignSystem): string {
  const parts = [`# ${ds.name || "Design system"}`];
  if (ds.rules.trim()) parts.push(ds.rules.trim());
  for (const g of GROUPS) {
    const rows = Object.entries(ds[g]);
    if (rows.length) parts.push([`## ${TITLE[g]}`, "| Token | Value |", "|---|---|", ...rows.map(([k, v]) => `| ${k} | ${cell(v)} |`)].join("\n"));
  }
  return parts.join("\n\n") + "\n";
}

/** The MCP tool descriptions (docs/design-system.md). */
export const DESIGN_TEXT = {
  get_design_system:
    "Read a project's design system: {design: {tokens, markdown, updated_at} | null}. READ IT BEFORE you design a screen or a scene, and use its tokens (colors, fonts, sizes, space, radius) and rules, so the project does not drift. null means the project has none: ask the owner or create one with set_design_system.",
  set_design_system:
    `Replace a project's whole design system with data {name?, colors, fonts, sizes, space, radius, rules?}. colors: {token: "#rrggbb"}; fonts: {token: "CSS font-family stack"}; sizes, space, radius: {token: whole pixels 0 to 999}; token names are slugs, at most ${TOKENS_MAX} per group; rules is Markdown (at most ${RULES_MAX} characters). The whole input is checked first and an error names the bad path; nothing is stored then. review_prototype then warns about screens that use colors, fonts or font sizes outside these tokens. Answer {design}.`,
  patch_design_system:
    `Change single tokens without resending the system: edits [{group, name, value}] or [{group, name, remove: true}] (1 to ${EDITS_MAX}), group one of colors, fonts, sizes, space, radius; for group "rules" or "name" give only value (text). Applied in order, then the whole system is re-checked and nothing is stored if it is invalid. The project must already have a design system. Answer {design}.`,
} as const;
