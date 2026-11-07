import { test } from "node:test";
import assert from "node:assert/strict";
import { activityText, adminEventHits, archiveFailure, describeOverview, projectNote } from "../web/admin.ts";
import { loginFailure, parseAuth } from "../web/login.ts";
import { parseRoute, routeProject } from "../web/state.ts";

const api = {
  totals: { projects: 2, designs: 3, scenes: 1, events: 40 },
  projects: [
    { id: "tvdash", name: "tvdash", designs: 3, scenes: 1, has_design_system: false, last_activity: 1000, archivable: false },
    { id: "billing", name: "", designs: 0, scenes: 0, has_design_system: false, last_activity: null, archivable: true },
    { nope: 1 },
  ],
};

test("describeOverview shapes projects and totals, skips junk, null when unreadable", () => {
  const m = describeOverview(api)!;
  assert.deepEqual(m.totals, { projects: 2, designs: 3, scenes: 1, events: 40 });
  assert.deepEqual(m.projects.map((p) => [p.id, p.name, p.archivable, p.lastActivity]), [["tvdash", "tvdash", false, 1000], ["billing", "billing", true, null]]);
  for (const bad of [null, "x", {}, { projects: 5 }]) assert.equal(describeOverview(bad), null, String(bad));
  assert.deepEqual(describeOverview({ projects: [] })!.totals, { projects: 0, designs: 0, scenes: 0, events: 0 });
});

test("row text: last activity, in-use note, archive failure lines", () => {
  const [a, b] = describeOverview(api)!.projects;
  assert.equal(activityText(a, 1000 + 3_600_000), "1 h ago");
  assert.equal(activityText(b, 5), "never");
  assert.equal(projectNote(a), "in use");
  assert.equal(projectNote(b), "");
  assert.equal(archiveFailure(409, { error: 'project "x" is not empty' }), 'project "x" is not empty');
  assert.equal(archiveFailure(500, {}), "Could not archive it. Try again.");
  assert.equal(archiveFailure(409, null), "Could not archive it.");
});

test("any project event refetches the admin page on show; nothing else does", () => {
  assert.equal(adminEventHits({ view: "admin" }, { project: "tv" }), true);
  assert.equal(adminEventHits({ view: "admin" }, { project: null }), false);
  assert.equal(adminEventHits({ view: "landing" }, { project: "tv" }), false);
});

test("the admin route parses and belongs to no project", () => {
  assert.deepEqual(parseRoute("#/admin"), { view: "admin" });
  assert.equal(routeProject({ view: "admin" }), null);
});

test("login: auth answer parsing and the failure lines", () => {
  assert.deepEqual(parseAuth({ password: true, session: false }), { password: true, session: false });
  for (const bad of [null, {}, { password: 1, session: false }, "x"]) assert.equal(parseAuth(bad), null, String(bad));
  assert.equal(loginFailure(401, { tries_left: 1 }), "Wrong password. 1 try left before a 15 minute pause.");
  assert.equal(loginFailure(401, { tries_left: 3 }), "Wrong password. 3 tries left before a 15 minute pause.");
  assert.equal(loginFailure(429, { retry_after: 890 }), "Too many tries. Try again in 15 minutes.");
  assert.equal(loginFailure(429, { retry_after: 30 }), "Too many tries. Try again in 1 minute.");
  assert.equal(loginFailure(429, null), "Too many tries. Try again in 15 minutes.");
  assert.equal(loginFailure(500, null), "Could not sign in. Try again.");
});
