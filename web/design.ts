// Pure logic of the design-system view (`#/project/<id>/design`, docs/design-system.md): no DOM. design-view.ts draws what these return.
// The answer is `GET /api/projects/<id>/design` = `{design: {tokens, markdown, updated_at} | null}`.
import { GROUPS, type Group } from "../src/design-system.ts";
import type { Route } from "./state.ts";

export type Token = { name: string; value: string | number };
export type DesignModel = {
  name: string;
  rules: string;
  markdown: string;
  updated_at: number;
  groups: { key: Group; title: string; tokens: Token[] }[]; // non-empty groups only, in GROUPS order
};

const TITLE: Record<Group, string> = { colors: "Colors", fonts: "Fonts", sizes: "Type sizes", space: "Space", radius: "Radius" };
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The model of an API answer; null when the project has no design system (or the answer is unreadable). Tolerant of gaps. */
export function describeDesign(api: unknown): DesignModel | null {
  const d = isRecord(api) ? api.design : null;
  if (!isRecord(d) || !isRecord(d.tokens)) return null;
  const t = d.tokens;
  const groups: DesignModel["groups"] = [];
  for (const key of GROUPS) {
    const g = t[key];
    if (!isRecord(g)) continue;
    const tokens = Object.entries(g).filter((e): e is [string, string | number] => typeof e[1] === "string" || typeof e[1] === "number").map(([name, value]) => ({ name, value }));
    if (tokens.length) groups.push({ key, title: TITLE[key], tokens });
  }
  return {
    name: typeof t.name === "string" ? t.name : "",
    rules: typeof t.rules === "string" ? t.rules : "",
    markdown: typeof d.markdown === "string" ? d.markdown : "",
    updated_at: typeof d.updated_at === "number" && Number.isFinite(d.updated_at) ? d.updated_at : 0,
    groups,
  };
}

/** `12 colors · 2 fonts` (groups that have tokens, singular for one); `empty` when there is none. */
export function designSummary(m: DesignModel): string {
  const word: Record<Group, [string, string]> = { colors: ["color", "colors"], fonts: ["font", "fonts"], sizes: ["size", "sizes"], space: ["space token", "space tokens"], radius: ["radius", "radii"] };
  return m.groups.map((g) => `${g.tokens.length} ${word[g.key][g.tokens.length === 1 ? 0 : 1]}`).join(" · ") || "empty";
}

/** A color the page may paint: exactly #rrggbb (the server stores nothing else, but the page does not trust it). */
export const paintable = (v: string | number): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/.test(v);

/** True when an event changes the design system on show, so the view refetches it. */
export const designEventHits = (route: Route, row: { project: string | null; kind: string }): boolean => route.view === "design" && row.project === route.id && row.kind === "design.set";

export type DesignTab = "tokens" | "markdown";
