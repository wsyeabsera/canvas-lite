// The admin overview and the one admin action (docs/auth.md): pure functions over `Sql`.
import { removeProject } from "./projects.ts";
import type { LiteEvent, Sql } from "./store.ts";

export type AdminProject = { id: string; name: string; designs: number; scenes: number; has_design_system: boolean; last_activity: number | null; archivable: boolean };
export type Overview = { totals: { projects: number; designs: number; scenes: number; events: number }; projects: AdminProject[] };

/** Every live project with what it holds. A project is archivable only when it holds nothing (no design, scene or design system). */
export function adminOverview(sql: Sql): Overview {
  const rows = sql.all<{ id: string; name: string; designs: number; scenes: number; ds: number; last: number | null }>(
    `SELECT p.id, p.name,
       (SELECT count(*) FROM canvases c WHERE c.project = p.id AND c.archived_at IS NULL) AS designs,
       (SELECT count(*) FROM scenes s WHERE s.project = p.id AND s.removed = 0) AS scenes,
       (SELECT count(*) FROM design_systems d WHERE d.project = p.id) AS ds,
       (SELECT max(e.ts) FROM events e WHERE e.project = p.id) AS last
     FROM projects p WHERE p.archived_at IS NULL ORDER BY p.name, p.id`,
  );
  const projects = rows.map((r) => ({
    id: r.id, name: r.name, designs: r.designs, scenes: r.scenes, has_design_system: r.ds > 0, last_activity: r.last,
    archivable: r.designs + r.scenes + r.ds === 0,
  }));
  const events = sql.all<{ n: number }>("SELECT count(*) AS n FROM events")[0].n;
  return {
    totals: { projects: projects.length, designs: projects.reduce((n, p) => n + p.designs, 0), scenes: projects.reduce((n, p) => n + p.scenes, 0), events },
    projects,
  };
}

/** Archives an empty project (the same archive as remove_project; open_project brings it back). A project that holds anything is refused. */
export function archiveEmptyProject(sql: Sql, id: string, now = Date.now()): { event: LiteEvent | null } {
  // The Hub is the only writer and runs one call at a time, so the check cannot go stale before the archive.
  const p = adminOverview(sql).projects.find((x) => x.id === id);
  if (!p) throw new Error(`unknown project "${id}"`);
  if (!p.archivable) throw new Error(`project "${id}" is not empty: only an empty project can be archived here`);
  return { event: removeProject(sql, id, now).event };
}
