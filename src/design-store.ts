// The design system of a project as pure functions over `Sql` (docs/design-system.md). The only code that touches the `design_systems`
// table. A write checks the whole input first, then stores it with its event in one transaction; the event never carries the document.
import { requireProject } from "./canvases.ts";
import { applyDesignEdits, checkDesignSystem, renderDesignMd, type DesignSystem } from "./design-system.ts";
import { appendEvent, type LiteEvent, type Sql } from "./store.ts";

export type Design = { tokens: DesignSystem; markdown: string; updated_at: number };

const design = (tokens: DesignSystem, updated_at: number): Design => ({ tokens, markdown: renderDesignMd(tokens), updated_at });

/** The stored system, or null when the project has none. */
export function readDesignSystem(sql: Sql, project: string): { tokens: DesignSystem; updated_at: number } | null {
  const [r] = sql.all<{ data: string; updated_at: number }>("SELECT data, updated_at FROM design_systems WHERE project = ?", project);
  return r ? { tokens: JSON.parse(r.data), updated_at: r.updated_at } : null;
}

export function getDesignSystem(sql: Sql, project: string): { design: Design | null } {
  requireProject(sql, project);
  const r = readDesignSystem(sql, project);
  return { design: r ? design(r.tokens, r.updated_at) : null };
}

function store(sql: Sql, project: string, tokens: DesignSystem, now: number): { design: Design; event: LiteEvent } {
  const data = JSON.stringify(tokens);
  sql.run(
    "INSERT INTO design_systems (project, data, updated_at) VALUES (?, ?, ?) ON CONFLICT (project) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    project, data, now,
  );
  const event = appendEvent(sql, { project, kind: "design.set", payload: { bytes: new TextEncoder().encode(data).length } }, now);
  return { design: design(tokens, now), event };
}

/** Replaces the whole design system. */
export function setDesignSystem(sql: Sql, project: string, input: unknown, now = Date.now()): { design: Design; event: LiteEvent } {
  requireProject(sql, project);
  const tokens = checkDesignSystem(input);
  return sql.transaction(() => store(sql, project, tokens, now));
}

/** Edits single tokens of an existing design system; the whole result is re-checked. */
export function patchDesignSystem(sql: Sql, project: string, edits: unknown, now = Date.now()): { design: Design; event: LiteEvent } {
  requireProject(sql, project);
  return sql.transaction(() => {
    const cur = readDesignSystem(sql, project);
    if (!cur) throw new Error(`project "${project}" has no design system: use set_design_system first`);
    return store(sql, project, applyDesignEdits(cur.tokens, edits), now);
  });
}
