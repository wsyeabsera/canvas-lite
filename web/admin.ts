// Pure logic of the admin page (`#/admin`, docs/auth.md): no DOM. admin-view.ts draws what these return.
// The answer is `GET /api/admin/overview` = `{totals, projects}`.
import { agoText } from "./canvas.ts";
import type { Route } from "./state.ts";

export type AdminProject = { id: string; name: string; designs: number; scenes: number; designSystem: boolean; lastActivity: number | null; archivable: boolean };
export type AdminModel = { totals: { projects: number; designs: number; scenes: number; events: number }; projects: AdminProject[] };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** The model of an API answer; null when unreadable. Tolerant of gaps. */
export function describeOverview(api: unknown): AdminModel | null {
  const o = typeof api === "object" && api !== null ? (api as { totals?: Record<string, unknown>; projects?: unknown }) : null;
  if (!o || !Array.isArray(o.projects)) return null;
  const projects: AdminProject[] = [];
  for (const p of o.projects) {
    if (!p || typeof p.id !== "string") continue;
    projects.push({
      id: p.id, name: typeof p.name === "string" && p.name ? p.name : p.id, designs: num(p.designs), scenes: num(p.scenes), designSystem: p.has_design_system === true,
      lastActivity: typeof p.last_activity === "number" ? p.last_activity : null, archivable: p.archivable === true,
    });
  }
  const t = o.totals ?? {};
  return { totals: { projects: num(t.projects), designs: num(t.designs), scenes: num(t.scenes), events: num(t.events) }, projects };
}

export const activityText = (p: Pick<AdminProject, "lastActivity">, now: number) => (p.lastActivity === null ? "never" : agoText(p.lastActivity, now));

/** What an unarchivable project says in the action column. */
export const projectNote = (p: Pick<AdminProject, "archivable">) => (p.archivable ? "" : "in use");

/** The line shown when archiving fails: the server's message for a refusal, else a generic one. */
export function archiveFailure(status: number, body: unknown): string {
  const msg = typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : "";
  return status === 409 || status === 404 ? msg || "Could not archive it." : "Could not archive it. Try again.";
}

/** Any event of a project can change the counts, so the admin page on show refetches (the view debounces). */
export const adminEventHits = (route: Route, row: { project: string | null }): boolean => route.view === "admin" && row.project !== null;
