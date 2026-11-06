// open_project / list_projects / read_project as pure functions over `Sql` (docs/open-project.md).
import { appendEvent, type LiteEvent, type Sql } from "./store.ts";

export const MANIFEST_LIMIT = 65536;

/** The open_project tool texts, built from MANIFEST_LIMIT so the guidance never drifts from the check. Pure, so unit tests read it. */
export const OPEN_PROJECT_TEXT = {
  description:
    `Register or refresh a project in Lite in one call, from a summary you build by reading the local checkout. Lite cannot read your disk, so you tell it. ` +
    `Build manifest.tree as repo-relative paths (never absolute), with directories as entries ending in "/" (for example "src/"); collapse big directories ` +
    `(node_modules, dist, vendored or generated folders) into the single entry "dir/" instead of listing what is inside. ` +
    `Build manifest.files as a few short excerpts (README first, about 1500 characters, then package.json or similar), each cut on a line boundary, never mid-line. ` +
    `The whole manifest, as JSON, must be at most ${MANIFEST_LIMIT} bytes; otherwise the call fails with the error "manifest too large: <bytes> bytes, limit ${MANIFEST_LIMIT}" and stores nothing, so trim the tree or the excerpts and call again. ` +
    `The returned project.files counts TREE ENTRIES (paths and directories), not the excerpts. ` +
    `Calling again with the same id replaces the stored summary.`,
  tree: `Repo-relative paths, never absolute; a trailing / marks a directory; collapse big directories to one "dir/" entry. Counts toward the ${MANIFEST_LIMIT}-byte manifest limit.`,
  files: `A few short excerpts as path to text (README first, about 1500 characters, then package.json), each cut on a line boundary. Counts toward the ${MANIFEST_LIMIT}-byte manifest limit.`,
  manifest: `The project summary. At most ${MANIFEST_LIMIT} bytes as JSON, or the call fails with "manifest too large: <bytes> bytes, limit ${MANIFEST_LIMIT}".`,
};
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const byteLength = (s: string) => new TextEncoder().encode(s).length;

export type Manifest = { tree: string[]; files: Record<string, string> };
export type OpenInput = { id?: string; name: string; kind?: string; repo?: string; manifest: Manifest };
export type ProjectSummary = { id: string; name: string; kind: string; repo: string | null; opened_at: number; files: number };

export const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");

type Row = { id: string; name: string; kind: string; repo: string | null; opened_at: number; manifest: string | null };
const summary = (r: Row): ProjectSummary => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  repo: r.repo,
  opened_at: r.opened_at,
  files: r.manifest ? (JSON.parse(r.manifest) as Manifest).tree.length : 0,
});

function validate(input: OpenInput): { id: string; name: string; kind: string; manifestJson: string } {
  if (typeof input?.name !== "string" || input.name.trim() === "" || input.name.length > 100)
    throw new Error("invalid name: use 1 to 100 characters");
  const id = input.id ?? slugify(input.name);
  if (typeof id !== "string" || id.length > 40 || !ID_RE.test(id))
    throw new Error(`invalid project id "${id}": use lowercase letters, digits and -, at most 40`);
  const kind = input.kind ?? "project";
  if (typeof kind !== "string" || kind.trim() === "" || kind.length > 40) throw new Error("invalid kind: use 1 to 40 characters");
  if (input.repo !== undefined && (typeof input.repo !== "string" || input.repo.length > 2000))
    throw new Error("invalid repo: use text of at most 2000 characters");
  const m = input.manifest as Manifest | undefined;
  if (
    !m || !Array.isArray(m.tree) || m.tree.some((p) => typeof p !== "string") ||
    typeof m.files !== "object" || m.files === null || Array.isArray(m.files) || Object.values(m.files).some((t) => typeof t !== "string")
  )
    throw new Error("invalid manifest: expected { tree: string[], files: { path: text } }");
  const manifestJson = JSON.stringify({ tree: m.tree, files: m.files });
  const bytes = byteLength(manifestJson);
  if (bytes > MANIFEST_LIMIT) throw new Error(`manifest too large: ${bytes} bytes, limit ${MANIFEST_LIMIT}`);
  return { id, name: input.name, kind, manifestJson };
}

/** Upserts the project and appends `project.opened` in one transaction. Returns the summary and the appended event. */
export function openProject(sql: Sql, input: OpenInput, now = Date.now()): { project: ProjectSummary; seq: number; event: LiteEvent } {
  const v = validate(input);
  const repo = input.repo ?? null;
  const files = input.manifest.tree.length;
  return sql.transaction(() => {
    sql.run(
      `INSERT INTO projects (id, name, kind, repo, manifest, opened_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, repo = excluded.repo,
         manifest = excluded.manifest, opened_at = excluded.opened_at`,
      v.id, v.name, v.kind, repo, v.manifestJson, now,
    );
    const payload = { name: v.name, kind: v.kind, repo, files, bytes: byteLength(v.manifestJson) };
    const event = appendEvent(sql, { project: v.id, kind: "project.opened", payload }, now);
    return { project: { id: v.id, name: v.name, kind: v.kind, repo, opened_at: now, files }, seq: event.seq, event };
  });
}

/** Newest `opened_at` first; no manifests. */
export function listProjects(sql: Sql): { projects: ProjectSummary[] } {
  const rows = sql.all<Row>("SELECT id, name, kind, repo, opened_at, manifest FROM projects ORDER BY opened_at DESC, id");
  return { projects: rows.map(summary) };
}

/** The summary, the stored manifest and the project's latest events (newest last, at most 20). */
export function readProject(sql: Sql, id: string): { project: ProjectSummary; manifest: Manifest; events: LiteEvent[] } {
  const [r] = sql.all<Row>("SELECT id, name, kind, repo, opened_at, manifest FROM projects WHERE id = ?", id);
  if (!r) throw new Error(`unknown project "${id}"`);
  const events = sql
    .all<{ seq: number; project: string | null; kind: string; payload: string; ts: number }>(
      "SELECT seq, project, kind, payload, ts FROM events WHERE project = ? ORDER BY seq DESC LIMIT 20",
      id,
    )
    .map((e) => ({ ...e, payload: JSON.parse(e.payload) }))
    .reverse();
  return { project: summary(r), manifest: r.manifest ? JSON.parse(r.manifest) : { tree: [], files: {} }, events };
}
