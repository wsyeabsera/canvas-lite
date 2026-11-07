import { test } from "node:test";
import assert from "node:assert/strict";
import { adminOverview, archiveEmptyProject } from "../src/admin.ts";
import { createCanvas } from "../src/canvases.ts";
import { setDesignSystem } from "../src/design-store.ts";
import { hubErrorResponse, routeApi } from "../src/api.ts";
import { openProject } from "../src/projects.ts";
import { createScene } from "../src/scene-store.ts";
import { eventsAfter, migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const sql = nodeSql();
migrate(sql);
for (const name of ["tvdash", "lite-app", "billing", "notes"]) openProject(sql, { name, manifest: { tree: [], files: {} } }, 1);
createCanvas(sql, "tvdash", { name: "Main", id: "main" }, 5);
createScene(sql, "tvdash", { name: "Town" }, 6);
setDesignSystem(sql, "lite-app", { colors: { bg: "#000000" } }, 7);

test("overview counts what each project holds; only a project holding nothing is archivable", () => {
  const o = adminOverview(sql);
  assert.deepEqual(o.projects.map((p) => [p.id, p.designs, p.scenes, p.has_design_system, p.archivable]), [
    ["billing", 0, 0, false, true], ["lite-app", 0, 0, true, false], ["notes", 0, 0, false, true], ["tvdash", 1, 1, false, false],
  ]);
  assert.deepEqual(o.totals, { projects: 4, designs: 1, scenes: 1, events: o.totals.events });
  assert.ok(o.projects.find((p) => p.id === "tvdash")!.last_activity! >= 1);
});

test("archiving an empty project removes it from the overview with an event; anything else is refused", () => {
  const r = archiveEmptyProject(sql, "billing", 9);
  assert.equal(r.event?.kind, "project.removed");
  assert.deepEqual(adminOverview(sql).projects.map((p) => p.id), ["lite-app", "notes", "tvdash"]);
  assert.throws(() => archiveEmptyProject(sql, "tvdash"), /project "tvdash" is not empty/);
  assert.throws(() => archiveEmptyProject(sql, "lite-app"), /is not empty/);
  assert.throws(() => archiveEmptyProject(sql, "billing"), /unknown project "billing"/, "already archived");
  assert.throws(() => archiveEmptyProject(sql, "gone"), /unknown project "gone"/);
  const before = eventsAfter(sql, 0, 1000).length;
  assert.throws(() => archiveEmptyProject(sql, "tvdash"));
  assert.equal(eventsAfter(sql, 0, 1000).length, before);
});

test("admin routes: GET overview, POST archive, ids checked, errors mapped", async () => {
  assert.deepEqual(routeApi("GET", "/api/admin/overview"), { kind: "admin-overview" });
  assert.deepEqual(routeApi("POST", "/api/admin/projects/notes/archive"), { kind: "archive", id: "notes" });
  assert.equal(routeApi("GET", "/api/admin/projects/notes/archive").kind, "error");
  assert.equal((routeApi("POST", "/api/admin/overview") as { status: number }).status, 405);
  assert.equal((routeApi("POST", "/api/admin/projects/BAD/archive") as { status: number }).status, 400);
  assert.equal((routeApi("GET", "/api/admin/nope") as { status: number }).status, 404);
  assert.equal(hubErrorResponse(new Error('project "x" is not empty: only an empty project can be archived here')).status, 409);
  assert.equal(hubErrorResponse(new Error('unknown project "x"')).status, 404);
});
