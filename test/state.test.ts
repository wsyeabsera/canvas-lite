import { test } from "node:test";
import assert from "node:assert/strict";
import { addRow, initialState, parseRoute, routeProject, visibleRows, describeProject, readmeLine, MAX_ROWS, sortedProjects, hrefScene, hrefScenePage, routeScene, sceneEventHits, routeCanvas, type State } from "../web/state.ts";
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

test("parseRoute: landing, activity and walk routes", () => {
  for (const h of ["", "#", "#/"]) assert.deepEqual(parseRoute(h), { view: "landing" }, h);
  assert.deepEqual(parseRoute("#/activity"), { view: "activity" });
  assert.deepEqual(parseRoute("#/project/tv/canvas/main/walk"), { view: "walk", id: "tv", canvas: "main" });
  assert.deepEqual(parseRoute("#/project/tv/canvas/Main/walk"), { view: "activity" });
  assert.equal(routeProject({ view: "landing" }), null);
});

test("parseRoute accepts only valid project ids", () => {
  assert.deepEqual(parseRoute("#/project/tvdash"), { view: "project", id: "tvdash" });
  assert.deepEqual(parseRoute("#/project/a-1"), { view: "project", id: "a-1" });
  for (const bad of ["#/project/", "#/project/-x", "#/project/A", "#/project/a/b", "#/project/a_b", `#/project/${"a".repeat(41)}`, "#/other", "#token=x"])
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

test("project.removed drops the project from the sidebar, and a later project.opened brings it back", () => {
  let s = initialState();
  s = addRow(s, row(1, "tvdash", "project.opened", { name: "tvdash", kind: "hobby", repo: null, files: 2, bytes: 9 }));
  s = addRow(s, row(2, "tvdash", "project.removed", { name: "tvdash" }));
  assert.deepEqual(Object.keys(s.projects), []);
  assert.equal(s.counts.tvdash, 2, "its events stay in the log and the counts");
  s = addRow(s, row(3, "tvdash", "project.opened", { name: "tvdash", kind: "hobby", repo: null, files: 2, bytes: 9 }));
  assert.deepEqual(Object.keys(s.projects), ["tvdash"]);
});

test("parseRoute: the scene route (Orbit mode) and its helpers", () => {
  assert.deepEqual(parseRoute("#/project/lite/scene/town"), { view: "scene", id: "lite", scene: "town" });
  assert.equal(hrefScene("lite", "town"), "#/project/lite/scene/town");
  assert.deepEqual(parseRoute(hrefScene("a-1", "b-2")), { view: "scene", id: "a-1", scene: "b-2" });
  for (const h of ["#/project/lite/scene/Town", "#/project/lite/scene/", "#/project/BAD/scene/town", "#/project/lite/scene/town/x"]) assert.deepEqual(parseRoute(h), { view: "activity" }, h);
  const r = parseRoute("#/project/lite/scene/town");
  assert.equal(routeProject(r), "lite");
  assert.equal(routeScene(r), "town");
  assert.equal(routeCanvas(r), null);
  assert.equal(routeScene(parseRoute("#/project/lite")), null);
  assert.equal(sceneEventHits(r, row(1, "lite", "scene.set", { scene: "town" })), true);
  assert.equal(sceneEventHits(r, row(1, "lite", "films.set", { scene: "town", count: 1 })), true);
  assert.equal(sceneEventHits(r, row(1, "lite", "scene.set", { scene: "other" })), false);
  assert.equal(sceneEventHits(r, row(1, "other", "scene.set", { scene: "town" })), false);
  assert.equal(sceneEventHits(r, row(1, "lite", "screen.set", { scene: "town" })), false);
  assert.equal(sceneEventHits(parseRoute("#/"), row(1, "lite", "scene.set", { scene: "town" })), false);
});

test("parseRoute: the scene page route and its live events", () => {
  assert.deepEqual(parseRoute("#/project/lite/scene/town/page"), { view: "scene-page", id: "lite", scene: "town" });
  assert.equal(hrefScenePage("lite", "town"), "#/project/lite/scene/town/page");
  for (const h of ["#/project/lite/scene/Town/page", "#/project/lite/scene/town/page/x", "#/project/lite/scene//page"]) assert.deepEqual(parseRoute(h), { view: "activity" }, h);
  const r = parseRoute("#/project/lite/scene/town/page");
  assert.equal(routeScene(r), "town");
  assert.equal(routeProject(r), "lite");
  assert.equal(routeCanvas(r), null);
  const ev = (kind: string, payload: unknown) => ({ project: "lite", kind, payload });
  assert.equal(sceneEventHits(r, ev("page.set", { scene: "town", sections: 3 })), true);
  assert.equal(sceneEventHits(r, ev("films.set", { scene: "town", count: 1 })), true);
  assert.equal(sceneEventHits(r, ev("page.set", { scene: "other", sections: 3 })), false);
  assert.equal(sceneEventHits(parseRoute("#/project/lite/scene/town"), ev("page.set", { scene: "town", sections: 3 })), false); // Orbit ignores the page
});
