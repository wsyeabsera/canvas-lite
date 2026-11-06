import { test } from "node:test";
import assert from "node:assert/strict";
import { addRow, initialState, parseRoute, visibleRows, describeProject, readmeLine, MAX_ROWS, sortedProjects, type State } from "../web/state.ts";
import type { WatchRow } from "../cli/format.ts";

const row = (seq: number, project: string | null, kind = "ping", payload: unknown = {}): WatchRow => ({ seq, project, kind, payload, ts: seq });
const feed = (rows: WatchRow[]): State => rows.reduce(addRow, initialState());

test("rows are ordered by seq and duplicates ignored", () => {
  const s = feed([row(2, "a"), row(1, "a"), row(2, "a"), row(3, null)]);
  assert.deepEqual(s.rows.map((r) => r.seq), [1, 2, 3]);
  assert.equal(s.total, 3);
  assert.equal(addRow(s, row(2, "a")), s);
});

test("rows are capped at the newest 500 but counts keep going", () => {
  let s = initialState();
  for (let i = 1; i <= MAX_ROWS + 20; i++) s = addRow(s, row(i, "a"));
  assert.equal(s.rows.length, MAX_ROWS);
  assert.equal(s.rows[0].seq, 21);
  assert.equal(s.counts.a, MAX_ROWS + 20);
  assert.equal(s.total, MAX_ROWS + 20);
});

test("projects come from project.opened, latest wins, with counts", () => {
  const s = feed([
    row(1, "tvdash", "project.opened", { name: "Old", kind: "web", repo: "https://x/y", files: 3, bytes: 9 }),
    row(2, "tvdash"),
    row(3, "tvdash", "project.opened", { name: "TV", kind: "app", repo: null, files: 5, bytes: 9 }),
    row(4, "alpha", "project.opened", { name: "Zed", kind: "cli", files: 1 }),
    row(5, null),
  ]);
  assert.deepEqual(s.projects.tvdash, { id: "tvdash", name: "TV", kind: "app", repo: null, files: 5 });
  assert.equal(s.counts.tvdash, 3);
  assert.equal(s.counts.alpha, 1);
  assert.deepEqual(sortedProjects(s).map((p) => p.id), ["tvdash", "alpha"]);
});

test("parseRoute accepts only valid project ids", () => {
  assert.deepEqual(parseRoute("#/project/tvdash"), { view: "project", id: "tvdash" });
  assert.deepEqual(parseRoute("#/project/a-1"), { view: "project", id: "a-1" });
  for (const bad of ["", "#", "#/", "#/project/", "#/project/-x", "#/project/A", "#/project/a/b", "#/project/a_b", `#/project/${"a".repeat(41)}`, "#/other", "#token=x"])
    assert.deepEqual(parseRoute(bad), { view: "activity" }, bad);
  assert.deepEqual(parseRoute(`#/project/${"a".repeat(40)}`), { view: "project", id: "a".repeat(40) });
});

test("visibleRows filters by project on the project route", () => {
  const s = feed([row(1, "a"), row(2, "b"), row(3, "a"), row(4, null)]);
  assert.equal(visibleRows(s, { view: "activity" }).length, 4);
  assert.deepEqual(visibleRows(s, { view: "project", id: "a" }).map((r) => r.seq), [1, 3]);
});

test("readmeLine takes the first non-empty line without heading marks", () => {
  assert.equal(readmeLine("\n\n# Hello world\nmore"), "Hello world");
  assert.equal(readmeLine(""), "");
  assert.equal(readmeLine(undefined), "");
  assert.equal(readmeLine("x".repeat(300)).length, 200);
});

test("describeProject shapes the API JSON", () => {
  const v = describeProject({
    project: { id: "tvdash", name: "TV Dash", kind: "web", repo: "https://github.com/a/b", opened_at: 1, files: 2 },
    manifest: { tree: ["README.md", "src/a.ts"], files: { "README.md": "# TV Dash\nbody" } },
    events: [row(1, "tvdash")],
  });
  assert.equal(v.title, "TV Dash");
  assert.equal(v.repo, "https://github.com/a/b");
  assert.equal(v.description, "TV Dash");
  assert.deepEqual(v.files, ["README.md", "src/a.ts"]);
  assert.equal(v.rows.length, 1);
});

test("describeProject drops unsafe repo links and tolerates gaps", () => {
  assert.equal(describeProject({ project: { id: "a", name: "A", kind: "k", repo: "javascript:alert(1)" } }).repo, null);
  const v = describeProject({ project: { id: "a" }, manifest: { tree: [], files: { "readme.md": "hi" } } });
  assert.equal(v.description, "hi");
  assert.equal(v.title, "a");
  assert.deepEqual(describeProject(null).files, []);
});
